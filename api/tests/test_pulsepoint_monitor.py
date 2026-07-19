import json
from pathlib import Path

from app.services.pulsepoint_monitor import normalize_feed


FIXTURES = Path(__file__).parent / "fixtures" / "pulsepoint"


def test_recorded_feed_contract_is_schema_tolerant() -> None:
    value = json.loads((FIXTURES / "feed-active.json").read_text())
    feed = normalize_feed(value)
    assert feed["active"][0]["classification"]["category"] == "medical"
    assert feed["active"][0]["units"][0]["normalizedId"] == "R44"


def test_missing_optional_fields_do_not_crash() -> None:
    feed = normalize_feed({"active": [{"id": "minimal"}], "recent": []})
    assert feed["active"][0]["address"] == ""
    assert feed["active"][0]["units"] == []
