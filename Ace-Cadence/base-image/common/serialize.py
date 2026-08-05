"""Row -> plain-dict helpers for services that query MySQL with raw SQL
(sqlalchemy.text) instead of the ORM. Every route builds its own response
dict rather than relying on a Pydantic response_model, so this is the one
shared place that handles the "datetime isn't JSON-serializable" problem
consistently."""

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.engine import Row


def _serialize_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def row_to_dict(row: Row | None) -> dict | None:
    if row is None:
        return None
    return {key: _serialize_value(value) for key, value in dict(row._mapping).items()}


def rows_to_dicts(rows) -> list[dict]:
    return [row_to_dict(row) for row in rows]


def to_json(value: list | dict | None) -> str | None:
    """For binding a JSON column param in a raw INSERT/UPDATE — MySQL's raw
    driver wants a JSON-encoded string, not a Python list/dict."""
    return None if value is None else json.dumps(value)


def from_json(value: str | list | dict | None) -> list | dict | None:
    """For reading a JSON column back out of a raw SELECT row — some
    drivers already decode JSON columns to Python objects, others return
    the raw string, so this handles both."""
    if value is None or isinstance(value, (list, dict)):
        return value
    return json.loads(value)
