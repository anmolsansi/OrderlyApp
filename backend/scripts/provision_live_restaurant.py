from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Literal, Optional, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

MAX_INPUT_BYTES = 64 * 1024


class ProvisioningInputError(ValueError):
    pass


class ProvisioningError(RuntimeError):
    pass


def require_target_environment() -> str:
    environment = os.getenv("ORDERLY_ENVIRONMENT", "").strip()
    if not environment:
        raise ProvisioningError("ORDERLY_ENVIRONMENT must be set explicitly")
    return environment


class DuplicateJSONKeyError(ValueError):
    pass


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateJSONKeyError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value: str):
    raise ValueError("non-standard JSON constant")


def parse_input_text(text: str) -> dict:
    try:
        payload = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_json_constant,
        )
    except DuplicateJSONKeyError:
        raise ProvisioningInputError("input JSON contains duplicate keys") from None
    except (json.JSONDecodeError, ValueError):
        raise ProvisioningInputError("input must be valid JSON") from None

    if not isinstance(payload, dict):
        raise ProvisioningInputError("input must be a JSON object")
    return payload


class HoursInterval(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    day: int = Field(ge=1, le=7)
    opens_minute: int = Field(ge=0, le=1439)
    closes_minute: int = Field(ge=1, le=1440)

    @model_validator(mode="after")
    def validate_interval_order(self) -> "HoursInterval":
        if self.opens_minute >= self.closes_minute:
            raise ValueError("opens_minute must be less than closes_minute")
        return self


class ProvisioningInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    restaurant_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=120)
    cuisine: str = Field(min_length=1)
    brand_label: str = Field(min_length=1, max_length=60)
    timezone: Literal["Asia/Kolkata"]
    hours: list[HoursInterval] = Field(max_length=14)

    @field_validator("hours")
    @classmethod
    def reject_overlapping_hours(cls, value: list[HoursInterval]) -> list[HoursInterval]:
        by_day: dict[int, list[HoursInterval]] = {}
        for interval in value:
            by_day.setdefault(interval.day, []).append(interval)

        for intervals in by_day.values():
            ordered = sorted(intervals, key=lambda item: item.opens_minute)
            for previous, current in zip(ordered, ordered[1:]):
                if current.opens_minute < previous.closes_minute:
                    raise ValueError("hours intervals must not overlap")
        return value

    @field_validator("restaurant_id", "name", "cuisine", "brand_label")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


def validate_input_object(payload: dict) -> ProvisioningInput:
    try:
        return ProvisioningInput.model_validate(payload)
    except ValidationError as error:
        fields = sorted({
            ".".join(str(part) for part in item["loc"]) or "input"
            for item in error.errors()
        })
        raise ProvisioningInputError(
            "invalid input fields: " + ", ".join(fields)
        ) from None


def read_input_text(path: Path) -> str:
    try:
        with path.open("rb") as input_file:
            raw = input_file.read(MAX_INPUT_BYTES + 1)
    except OSError:
        raise ProvisioningInputError("input file cannot be read") from None

    if len(raw) > MAX_INPUT_BYTES:
        raise ProvisioningInputError("input file exceeds the 64 KiB limit")

    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ProvisioningInputError("input file must be UTF-8") from None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Provision a disabled live restaurant from a private JSON file.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Path to the private restaurant provisioning JSON file.",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    parser.parse_args(argv)
    parser.error("restaurant provisioning is not available yet")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
