from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Iterator

from ..config import get_settings


@contextmanager
def db_connection(path: str | None = None) -> Iterator[sqlite3.Connection]:
    db_path = Path(path or get_settings().db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        str(db_path),
        timeout=5.0,
        isolation_level=None,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        yield conn
    finally:
        conn.close()


def initialize_database(path: str | None = None) -> None:
    from .migrations import run_migrations

    db_path = path or get_settings().db_path
    run_migrations(db_path)
    with db_connection(db_path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
