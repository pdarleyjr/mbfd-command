from .connection import db_connection, initialize_database
from .legacy import (
    add_transcript,
    clear_transcript,
    ensure_incident,
    get_board,
    get_transcript,
    save_board,
)


def init_db() -> None:
    initialize_database()


__all__ = [
    "add_transcript",
    "clear_transcript",
    "db_connection",
    "ensure_incident",
    "get_board",
    "get_transcript",
    "init_db",
    "save_board",
]
