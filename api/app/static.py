from __future__ import annotations

from starlette.staticfiles import StaticFiles
from starlette.types import Receive, Scope, Send


class HttpOnlyStaticFiles(StaticFiles):
    """Serve the SPA without letting unknown WebSockets reach StaticFiles.

    Starlette routes unmatched WebSocket paths through a root mount.  Its
    StaticFiles implementation intentionally accepts HTTP scopes only, so an
    old browser tab retrying a retired socket path otherwise raises an
    AssertionError for every reconnect attempt.
    """

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "websocket":
            await send(
                {
                    "type": "websocket.close",
                    "code": 1008,
                    "reason": "WebSocket endpoint not found",
                }
            )
            return
        await super().__call__(scope, receive, send)
