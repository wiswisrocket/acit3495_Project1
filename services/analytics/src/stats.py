"""Pure functions that turn MySQL aggregate rows into MongoDB documents."""

from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional


def _number(value: Any, digits: int = 4) -> Optional[float]:
    """Convert a Decimal/int/float from MySQL to a rounded float. None stays None."""
    if value is None:
        return None
    return round(float(value), digits)


def _stats_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "count": int(row["count"]),
        "min": _number(row["min"]),
        "max": _number(row["max"]),
        "avg": _number(row["avg"]),
    }


def build_documents(
    overall_row: Dict[str, Any],
    user_rows: Iterable[Dict[str, Any]],
    now: datetime,
) -> List[Dict[str, Any]]:
    """Build the documents stored in the `stats` collection.

    One document with _id "overall", plus one per user with _id "user:<username>".
    """
    docs: List[Dict[str, Any]] = [
        {"_id": "overall", "scope": "overall", **_stats_fields(overall_row), "updated_at": now}
    ]
    for row in user_rows:
        docs.append(
            {
                "_id": f"user:{row['username']}",
                "scope": "user",
                "username": row["username"],
                **_stats_fields(row),
                "updated_at": now,
            }
        )
    return docs
