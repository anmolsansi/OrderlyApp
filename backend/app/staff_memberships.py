"""CON-06: restaurant-scoped, database-backed staff authority.

No browser roles, guest identity, or provider calls inside a transaction.
"""
from __future__ import annotations

import json
import os
from typing import Any, Collection, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from .staff_identity import StaffPrincipal

Role = Literal["owner", "order_staff", "cashier"]
ROLES = frozenset({"owner", "order_staff", "cashier"})
OWNER_ONLY = frozenset({"owner"})
MAX_VERSION = 9223372036854775807
VERIFIED_SUBJECTS_ENV = "ORDERLY_OPERATOR_VERIFIED_STAFF_SUBJECTS"
_COLUMNS = "restaurant_id, clerk_user_id, role, active, version"


class MembershipError(Exception):
    def __init__(self, status_code: int, code: str, message: str, fields: list[str] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields or []


def not_found() -> MembershipError:
    return MembershipError(404, "not_found", "Not found")


def denied() -> MembershipError:
    return MembershipError(403, "permission_denied", "No access")


def invalid(fields: list[str]) -> MembershipError:
    return MembershipError(422, "invalid_input", "Check highlighted fields", fields)


def unavailable() -> MembershipError:
    return MembershipError(503, "storage_unavailable", "Try later")


class Membership(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    restaurant_id: str
    clerk_user_id: str
    role: Role
    active: bool
    version: int = Field(ge=1, le=MAX_VERSION)


class MembershipSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    restaurant_id: str
    role: Role
    version: int = Field(ge=1, le=MAX_VERSION)


class MembershipUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    expected_version: int = Field(ge=0, le=MAX_VERSION)
    role: Role
    active: bool


def _identifier(value: str, *, restaurant: bool = False) -> bool:
    return (isinstance(value, str) and bool(value.strip()) and value.isprintable()
            and (not restaurant or len(value) <= 100))


def validate_identifiers(rid: str, subject: str | None = None) -> None:
    fields = []
    if not _identifier(rid, restaurant=True):
        fields.append("restaurant_id")
    if subject is not None and not _identifier(subject):
        fields.append("clerk_user_id")
    if fields:
        raise invalid(fields)


def operator_verified(rid: str, subject: str) -> bool:
    """Operator-only, restaurant-scoped exact subject approvals.

    JSON object of restaurant IDs to arrays of independently verified Clerk
    subjects. Missing config authorizes nobody; malformed config fails closed.
    This is local configuration, not a browser assertion or self-enrollment.
    """
    raw = os.getenv(VERIFIED_SUBJECTS_ENV)
    if not raw:
        return False
    try:
        if len(raw.encode("utf-8")) > 65536:
            raise ValueError("oversized configuration")
        def unique_pairs(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError("duplicate restaurant")
                result[key] = value
            return result
        entries = json.loads(raw, object_pairs_hook=unique_pairs)
        if not isinstance(entries, dict):
            raise ValueError("invalid configuration")
        for key, values in entries.items():
            if (not _identifier(key, restaurant=True) or not isinstance(values, list)
                    or any(not _identifier(value) for value in values)):
                raise ValueError("invalid configuration")
        return subject in entries.get(rid, [])
    except (ValueError, TypeError, UnicodeError):
        raise MembershipError(503, "identity_unavailable", "Staff identity unavailable") from None


def require_role(conn: Any, principal: StaffPrincipal, rid: str,
                 allowed: Collection[str]) -> Membership:
    """Read fresh authority for this action, never cache a role from the JWT."""
    validate_identifiers(rid)
    row = conn.execute(
        """SELECT m.restaurant_id, m.clerk_user_id, m.role, m.active, m.version
           FROM live_memberships m
           JOIN live_restaurants r ON r.restaurant_id = m.restaurant_id
           WHERE m.restaurant_id = %s AND m.clerk_user_id = %s
             AND m.active AND NOT r.synthetic""",
        (rid, principal.sub),
    ).fetchone()
    if row is None:
        raise not_found()
    membership = Membership.model_validate(row)
    if membership.role not in allowed:
        raise denied()
    return membership


def list_own_memberships(conn: Any, principal: StaffPrincipal) -> list[MembershipSummary]:
    rows = conn.execute(
        """SELECT m.restaurant_id, m.role, m.version
           FROM live_memberships m JOIN live_restaurants r
             ON r.restaurant_id = m.restaurant_id
           WHERE m.clerk_user_id = %s AND m.active AND NOT r.synthetic
           ORDER BY m.restaurant_id""",
        (principal.sub,),
    ).fetchall()
    return [MembershipSummary.model_validate(row) for row in rows]


def _lock_restaurant(conn: Any, rid: str, *, write: bool) -> None:
    # Fixed SQL clauses only; never interpolate a request value.
    lock = "FOR UPDATE" if write else "FOR SHARE"
    if conn.execute(
        "SELECT restaurant_id FROM live_restaurants WHERE restaurant_id = %s "
        "AND NOT synthetic " + lock, (rid,),
    ).fetchone() is None:
        raise not_found()


def list_members(conn: Any, principal: StaffPrincipal, rid: str) -> list[Membership]:
    validate_identifiers(rid)
    with conn.transaction():
        _lock_restaurant(conn, rid, write=False)
        require_role(conn, principal, rid, OWNER_ONLY)
        rows = conn.execute(
            f"SELECT {_COLUMNS} FROM live_memberships WHERE restaurant_id = %s ORDER BY clerk_user_id",
            (rid,),
        ).fetchall()
        return [Membership.model_validate(row) for row in rows]


def get_member(conn: Any, principal: StaffPrincipal, rid: str, subject: str) -> Membership:
    validate_identifiers(rid, subject)
    with conn.transaction():
        _lock_restaurant(conn, rid, write=False)
        require_role(conn, principal, rid, OWNER_ONLY)
        row = conn.execute(
            f"SELECT {_COLUMNS} FROM live_memberships WHERE restaurant_id = %s AND clerk_user_id = %s",
            (rid, subject),
        ).fetchone()
        if row is None:
            raise not_found()
        return Membership.model_validate(row)


def _version_conflict() -> MembershipError:
    return MembershipError(409, "version_conflict", "Changed since review", ["expected_version"])


def _audit(conn: Any, actor: StaffPrincipal, before: Membership | None,
           after: Membership) -> None:
    conn.execute(
        """INSERT INTO live_membership_audit
           (id, restaurant_id, subject, actor, old_role, new_role, old_active, new_active)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (uuid4(), after.restaurant_id, after.clerk_user_id, actor.sub,
         before.role if before is not None else None, after.role,
         before.active if before is not None else None, after.active),
    )


def put_member(conn: Any, principal: StaffPrincipal, rid: str, subject: str,
               change: MembershipUpdate) -> tuple[Membership, bool]:
    """Return membership and created flag after one atomic, tenant-locked write."""
    validate_identifiers(rid, subject)
    with conn.transaction():
        # All membership writers, including RS-04 bootstrap, lock parent first.
        # Reauthorize only AFTER obtaining the lock, not at screen entry.
        _lock_restaurant(conn, rid, write=True)
        require_role(conn, principal, rid, OWNER_ONLY)
        row = conn.execute(
            f"SELECT {_COLUMNS} FROM live_memberships WHERE restaurant_id = %s "
            "AND clerk_user_id = %s FOR UPDATE", (rid, subject),
        ).fetchone()
        before = Membership.model_validate(row) if row is not None else None
        if before is None:
            if change.expected_version != 0:
                raise _version_conflict()
            if not operator_verified(rid, subject):
                raise not_found()
            row = conn.execute(
                f"""INSERT INTO live_memberships (restaurant_id, clerk_user_id, role, active)
                    VALUES (%s, %s, %s, %s) RETURNING {_COLUMNS}""",
                (rid, subject, change.role, change.active),
            ).fetchone()
        else:
            if before.version != change.expected_version:
                raise _version_conflict()
            # Identical current-version PUT is a true no-op, matching CON-06-2.
            if before.role == change.role and before.active == change.active:
                return before, False
            if before.version == MAX_VERSION:
                raise _version_conflict()
            if (before.role == "owner" and before.active
                    and (change.role != "owner" or not change.active)):
                other = conn.execute(
                    """SELECT 1 FROM live_memberships WHERE restaurant_id = %s
                       AND clerk_user_id <> %s AND role = 'owner' AND active LIMIT 1""",
                    (rid, subject),
                ).fetchone()
                if other is None:
                    raise MembershipError(409, "last_owner", "At least one active owner is required")
            row = conn.execute(
                f"""UPDATE live_memberships SET role = %s, active = %s,
                       version = version + 1, updated_at = now()
                    WHERE restaurant_id = %s AND clerk_user_id = %s AND version = %s
                    RETURNING {_COLUMNS}""",
                (change.role, change.active, rid, subject, change.expected_version),
            ).fetchone()
            if row is None:
                raise _version_conflict()
        after = Membership.model_validate(row)
        _audit(conn, principal, before, after)
        return after, before is None
