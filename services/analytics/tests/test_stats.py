from datetime import datetime, timezone
from decimal import Decimal

from health import HealthState
from stats import build_documents

NOW = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


def test_builds_overall_and_user_documents():
    overall = {"count": 3, "min": Decimal("1.5000"), "max": Decimal("9.0000"), "avg": Decimal("4.5000")}
    users = [
        {"username": "alice", "count": 2, "min": Decimal("1.5"), "max": Decimal("9"), "avg": Decimal("5.25")},
        {"username": "bob", "count": 1, "min": Decimal("3"), "max": Decimal("3"), "avg": Decimal("3")},
    ]
    docs = build_documents(overall, users, NOW)

    assert [d["_id"] for d in docs] == ["overall", "user:alice", "user:bob"]
    assert docs[0] == {
        "_id": "overall",
        "scope": "overall",
        "count": 3,
        "min": 1.5,
        "max": 9.0,
        "avg": 4.5,
        "updated_at": NOW,
    }
    assert docs[1]["username"] == "alice"
    assert docs[1]["avg"] == 5.25


def test_empty_table_produces_null_stats_and_no_users():
    overall = {"count": 0, "min": None, "max": None, "avg": None}
    docs = build_documents(overall, [], NOW)
    assert len(docs) == 1
    assert docs[0]["count"] == 0
    assert docs[0]["min"] is None and docs[0]["avg"] is None


def test_average_is_rounded_to_four_places():
    overall = {"count": 3, "min": Decimal("0"), "max": Decimal("1"), "avg": Decimal("0.333333333")}
    assert build_documents(overall, [], NOW)[0]["avg"] == 0.3333


def test_health_has_startup_grace_then_requires_recent_success():
    state = HealthState(interval_seconds=30, startup_grace_seconds=120)
    start = state.started_at
    assert state.is_healthy(now=start + 60) is True       # still starting up
    assert state.is_healthy(now=start + 200) is False     # never succeeded, grace over

    state.last_success = start + 100
    assert state.is_healthy(now=start + 150) is True      # recent success
    assert state.is_healthy(now=start + 100 + 91) is False  # nothing for > max(3*interval, 90)
