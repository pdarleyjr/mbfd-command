from app.domain.pulsepoint_types import classify_run, normalize_unit_id


def test_official_codes_are_classified_deterministically() -> None:
    assert classify_run("ME", "anything").model_dump() == {
        "category": "medical", "subtype": "medical", "source": "pulsepoint_code"
    }
    assert classify_run("WCF", "anything").subtype == "fire"
    assert classify_run("WR", "anything").subtype == "marine"


def test_missing_code_uses_lower_confidence_label_fallback() -> None:
    result = classify_run(None, "Vehicle collision with patient")
    assert result.subtype == "medical" or result.subtype == "vehicle"
    assert result.source == "label_fallback"


def test_unit_normalization_is_alias_safe() -> None:
    assert normalize_unit_id("Rescue 44") == "R44"
    assert normalize_unit_id("County-9") == "COUNTY9"
