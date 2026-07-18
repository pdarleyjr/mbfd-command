from app.parser import needs_qwen_enrichment, parse_deterministic


def test_deterministic_parser_normalizes_units_and_priority() -> None:
    parsed = parse_deterministic("Engine one to command: mayday, firefighter trapped")
    assert parsed.speaker == "E1"
    assert parsed.recipient == "Command"
    assert parsed.message_type == "mayday"
    assert parsed.priority == "emergency"
    assert needs_qwen_enrichment(parsed) is False


def test_ambiguous_text_is_marked_for_constrained_enrichment() -> None:
    parsed = parse_deterministic("copy that at the east entrance")
    assert parsed.corrected_text == "copy that at the east entrance"
    assert needs_qwen_enrichment(parsed) is True
