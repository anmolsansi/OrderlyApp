"""CON-09 owner settings: strict validation, tenant locking and versioned writes."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .staff_identity import StaffPrincipal
from .staff_memberships import (
    MAX_VERSION, OWNER_ONLY, MembershipError, _lock_restaurant,
    not_found, require_read_committed, require_role,
)


class HoursInterval(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    day: int = Field(ge=1, le=7)
    opens_minute: int = Field(ge=0, le=1439)
    closes_minute: int = Field(ge=1, le=1440)

    @model_validator(mode="after")
    def validate_bounds(self):
        if self.opens_minute >= self.closes_minute:
            raise ValueError("opening must precede closing")
        return self


class SettingsFields(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(min_length=1, max_length=120)
    brand_label: str = Field(min_length=1, max_length=60)
    timezone: Literal["Asia/Kolkata"]
    hours: list[HoursInterval] = Field(max_length=14)
    is_open: bool

    @field_validator("name", "brand_label")
    @classmethod
    def validate_label(cls, value: str):
        if not value.strip() or not value.isprintable():
            raise ValueError("nonblank printable label required")
        return value

    @field_validator("hours")
    @classmethod
    def normalize_hours(cls, value: list[HoursInterval]):
        ordered = sorted(value, key=lambda interval: (interval.day, interval.opens_minute, interval.closes_minute))
        for previous, current in zip(ordered, ordered[1:]):
            if previous.day == current.day and previous.closes_minute > current.opens_minute:
                raise ValueError("hours intervals must not overlap")
        return ordered


class SettingsUpdate(SettingsFields):
    expected_version: int = Field(ge=1, le=MAX_VERSION)


class Settings(SettingsFields):
    id: str
    ordering_enabled: bool
    version: int = Field(ge=1, le=MAX_VERSION)


def within_ordering_hours(settings: SettingsFields, instant: datetime) -> bool:
    """Manual switch AND half-open local intervals; empty schedule is closed."""
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("timezone-aware instant required")
    local = instant.astimezone(ZoneInfo("Asia/Kolkata"))
    minute = local.hour * 60 + local.minute
    return settings.is_open and any(
        interval.day == local.isoweekday() and interval.opens_minute <= minute < interval.closes_minute
        for interval in settings.hours
    )


def _read(conn: Any, rid: str) -> Settings:
    row = conn.execute(
        """SELECT r.id, r.name, r.is_open, l.brand_label, l.timezone,
                  l.hours, l.ordering_enabled, l.version
           FROM live_restaurants l JOIN restaurants r ON r.id = l.restaurant_id
           WHERE l.restaurant_id = %s AND NOT l.synthetic""", (rid,),
    ).fetchone()
    if row is None:
        raise not_found()
    return Settings.model_validate(row)


def _authorize_and_lock(conn: Any, principal: StaffPrincipal, rid: str, *, write: bool):
    require_read_committed(conn)
    require_role(conn, principal, rid, OWNER_ONLY)
    _lock_restaurant(conn, rid, write=write)
    require_role(conn, principal, rid, OWNER_ONLY)


def get_settings(conn: Any, principal: StaffPrincipal, rid: str) -> Settings:
    with conn.transaction():
        _authorize_and_lock(conn, principal, rid, write=False)
        return _read(conn, rid)


def put_settings(conn: Any, principal: StaffPrincipal, rid: str, change: SettingsUpdate) -> Settings:
    with conn.transaction():
        _authorize_and_lock(conn, principal, rid, write=True)
        # All settings writers lock the live parent before the compatibility row.
        if conn.execute("SELECT id FROM restaurants WHERE id = %s FOR UPDATE", (rid,)).fetchone() is None:
            raise not_found()
        current = _read(conn, rid)
        if change.expected_version != current.version:
            raise MembershipError(409, "version_conflict", "Changed since review", ["expected_version"])
        proposed = change.model_dump(exclude={"expected_version"})
        if proposed == current.model_dump(exclude={"id", "ordering_enabled", "version"}):
            return current
        if current.version == MAX_VERSION:
            raise MembershipError(409, "version_conflict", "Changed since review", ["expected_version"])
        conn.execute("UPDATE restaurants SET name = %s, is_open = %s WHERE id = %s",
                     (change.name, change.is_open, rid))
        conn.execute(
            """UPDATE live_restaurants SET brand_label = %s, hours = %s,
                      version = version + 1, updated_at = now()
               WHERE restaurant_id = %s AND NOT synthetic""",
            (change.brand_label, Jsonb(proposed["hours"]), rid),
        )
        return _read(conn, rid)
