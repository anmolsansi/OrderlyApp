"""Additive CON-06 staff API; live mode is disabled by default."""
from __future__ import annotations

import json
import os

from anyio import fail_after
from contextlib import contextmanager

import psycopg
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from .database import database_url, get_connection
from .staff_identity import StaffPrincipal, verify_staff_token
from .staff_db_security import assert_staff_runtime_role
from .staff_memberships import (
    Membership, MembershipSummary, MembershipUpdate, get_member, invalid,
    list_members, list_own_memberships, put_member, unavailable,
)

router = APIRouter(prefix="/v1/live/staff", tags=["live-staff"])
MAX_BODY_BYTES = 64 * 1024


class OwnMemberships(BaseModel):
    model_config = ConfigDict(extra="forbid")
    memberships: list[MembershipSummary]


class RestaurantMembers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    memberships: list[Membership]


def staff_principal(request: Request) -> StaffPrincipal:
    # Do not contact Clerk at all while live service is disabled.
    if os.getenv("ORDERLY_LIVE_ENABLED", "0") != "1":
        raise unavailable()
    return verify_staff_token(request)


@contextmanager
def staff_connection():
    if not database_url():
        raise unavailable()
    try:
        # Commit errors also propagate through this boundary before returning success.
        with get_connection(connect_timeout_seconds=2) as conn:
            # Force a fresh statement snapshot even if the DSN/database default
            # is REPEATABLE READ. Establish before the first SQL statement.
            conn.isolation_level = psycopg.IsolationLevel.READ_COMMITTED
            with conn.transaction():
                conn.execute("SET LOCAL lock_timeout = '2s'")
                conn.execute("SET LOCAL statement_timeout = '4s'")
                assert_staff_runtime_role(conn)
                yield conn
    except psycopg.Error:
        raise unavailable() from None


@router.get("/memberships", response_model=OwnMemberships)
def own_memberships(response: Response, principal: StaffPrincipal = Depends(staff_principal)):
    response.headers["Cache-Control"] = "no-store"
    with staff_connection() as conn:
        return OwnMemberships(memberships=list_own_memberships(conn, principal))


@router.get("/restaurants/{rid}/members", response_model=RestaurantMembers)
def restaurant_members(rid: str, response: Response, principal: StaffPrincipal = Depends(staff_principal)):
    response.headers["Cache-Control"] = "no-store"
    with staff_connection() as conn:
        return RestaurantMembers(memberships=list_members(conn, principal, rid))


@router.get("/restaurants/{rid}/members/{subject}", response_model=Membership)
def restaurant_member(rid: str, subject: str, response: Response,
                      principal: StaffPrincipal = Depends(staff_principal)):
    response.headers["Cache-Control"] = "no-store"
    with staff_connection() as conn:
        return get_member(conn, principal, rid, subject)


def _unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON field")
        result[key] = value
    return result


async def _read_update(request: Request) -> MembershipUpdate:
    # Stream-limit the direct backend too; do not rely on the future gateway.
    body = bytearray()
    try:
        with fail_after(5):
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_BODY_BYTES:
                    raise invalid(["body"])
                body.extend(chunk)
    except (ClientDisconnect, TimeoutError):
        raise invalid(["body"]) from None
    try:
        # Reject duplicate fields before the strict DTO sees the document.
        json.loads(bytes(body), object_pairs_hook=_unique_json_object)
        return MembershipUpdate.model_validate_json(bytes(body))
    except ValidationError as exc:
        fields = list(dict.fromkeys(
            ".".join(str(part) for part in error["loc"]) or "body"
            for error in exc.errors()
        ))
        raise invalid(fields) from None
    except (ValueError, UnicodeError, RecursionError):
        raise invalid(["body"]) from None


def _write(principal: StaffPrincipal, rid: str, subject: str, change: MembershipUpdate):
    with staff_connection() as conn:
        return put_member(conn, principal, rid, subject, change)


@router.put("/restaurants/{rid}/members/{subject}", response_model=Membership,
            responses={201: {"model": Membership}},
            openapi_extra={"requestBody": {"required": True, "content": {
                "application/json": {"schema": MembershipUpdate.model_json_schema()}
            }}})
async def update_restaurant_member(rid: str, subject: str, request: Request, response: Response,
                                   principal: StaffPrincipal = Depends(staff_principal)):
    change = await _read_update(request)
    membership, created = await run_in_threadpool(_write, principal, rid, subject, change)
    response.status_code = 201 if created else 200
    response.headers["Cache-Control"] = "no-store"
    return membership
