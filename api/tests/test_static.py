import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.static import HttpOnlyStaticFiles


def test_unknown_websocket_closes_without_reaching_static_files(tmp_path):
    (tmp_path / "index.html").write_text("ok", encoding="utf-8")
    app = FastAPI()
    app.mount("/", HttpOnlyStaticFiles(directory=tmp_path, html=True))

    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect("/retired/socket"):
                pass

    assert exc.value.code == 1008
    assert exc.value.reason == "WebSocket endpoint not found"
