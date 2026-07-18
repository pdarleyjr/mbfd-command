import pytest

from app.config import require_single_process


def test_in_memory_websocket_hub_requires_one_worker():
    require_single_process(1)
    with pytest.raises(RuntimeError, match="must remain 1"):
        require_single_process(2)
