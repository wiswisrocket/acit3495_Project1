"""Analytics Service.

Every ANALYTICS_INTERVAL_SECONDS: read raw measurements from MySQL, compute
count/min/max/average (overall and per user) and write the results to MongoDB.
If either database is down the cycle is logged and retried on the next tick.
"""

import json
import logging
import os
import signal
import sys
import threading
from datetime import datetime, timezone

import pymysql
import pymysql.cursors
from pymongo import MongoClient, ReplaceOne
from pymongo.errors import PyMongoError

from health import HealthState, start_health_server
from stats import build_documents

OVERALL_SQL = (
    "SELECT COUNT(*) AS count, MIN(value) AS min, MAX(value) AS max, AVG(value) AS avg FROM measurements"
)
PER_USER_SQL = (
    "SELECT username, COUNT(*) AS count, MIN(value) AS min, MAX(value) AS max, AVG(value) AS avg "
    "FROM measurements GROUP BY username"
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname.lower(),
                "service": "analytics",
                "msg": record.getMessage(),
            }
        )


def setup_logging() -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("analytics")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    return logger


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        logging.getLogger("analytics").error("missing required environment variable %s", name)
        sys.exit(1)
    return value


def read_measurements(config: dict):
    conn = pymysql.connect(
        host=config["db_host"],
        user=config["db_user"],
        password=config["db_password"],
        database=config["db_name"],
        connect_timeout=5,
        read_timeout=10,
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(OVERALL_SQL)
            overall = cur.fetchone()
            cur.execute(PER_USER_SQL)
            users = cur.fetchall()
        return overall, users
    finally:
        conn.close()


def run_cycle(config: dict, mongo_collection, log: logging.Logger) -> int:
    overall, users = read_measurements(config)
    docs = build_documents(overall, users, datetime.now(timezone.utc))
    mongo_collection.bulk_write([ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in docs])
    log.info("cycle ok: %d measurements, %d users", docs[0]["count"], len(docs) - 1)
    return docs[0]["count"]


def main() -> None:
    log = setup_logging()
    config = {
        "db_host": require_env("DB_HOST"),
        "db_name": require_env("DB_NAME"),
        "db_user": require_env("DB_USER"),
        "db_password": require_env("DB_PASSWORD"),
        "mongo_host": require_env("MONGO_HOST"),
        "mongo_db": require_env("MONGO_DB"),
        "mongo_user": require_env("MONGO_USER"),
        "mongo_password": require_env("MONGO_PASSWORD"),
    }
    try:
        interval = max(5, int(os.environ.get("ANALYTICS_INTERVAL_SECONDS", "30")))
    except ValueError:
        log.error("ANALYTICS_INTERVAL_SECONDS must be an integer")
        sys.exit(1)

    # Credentials passed as arguments (not in a URL) so special characters never need escaping.
    mongo = MongoClient(
        host=config["mongo_host"],
        port=27017,
        username=config["mongo_user"],
        password=config["mongo_password"],
        authSource=config["mongo_db"],
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
    )
    collection = mongo[config["mongo_db"]]["stats"]

    state = HealthState(interval)
    start_health_server(state, int(os.environ.get("HEALTH_PORT", "8000")))

    stop = threading.Event()

    def handle_signal(signum, frame):
        log.info("shutting down (signal %s)", signum)
        stop.set()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    log.info("analytics started, interval %ds", interval)
    while not stop.is_set():
        try:
            run_cycle(config, collection, log)
            state.record_success()
        except (pymysql.MySQLError, PyMongoError) as exc:
            # Log the exception type only: driver messages can echo connection details.
            state.record_failure(type(exc).__name__)
            log.error("cycle failed (%s), will retry in %ds", type(exc).__name__, interval)
        except Exception as exc:  # keep the worker alive on any unexpected error
            state.record_failure(type(exc).__name__)
            log.error("unexpected error (%s), will retry in %ds", type(exc).__name__, interval)
        stop.wait(interval)

    mongo.close()


if __name__ == "__main__":
    main()
