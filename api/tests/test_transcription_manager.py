from datetime import datetime, timedelta, timezone
import asyncio

from app.transcription.manager import LeaseConflict, TranscriptionManager


def test_one_capture_lease_per_incident_and_expiry() -> None:
    async def scenario() -> None:
        manager = TranscriptionManager(lease_ttl_s=10)
        first = await manager.acquire("inc_a", "client_a", "Command Tablet")
        assert first.lease_id
        try:
            await manager.acquire("inc_a", "client_b", "Lobby Tablet")
        except LeaseConflict:
            pass
        else:
            raise AssertionError("a second live capture lease was granted")

        manager._states["inc_a"].lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        second = await manager.acquire("inc_a", "client_b", "Lobby Tablet")
        assert second.capture_client_id == "client_b"
        assert second.lease_id != first.lease_id
    asyncio.run(scenario())


def test_any_viewer_can_stop_capture() -> None:
    async def scenario() -> None:
        manager = TranscriptionManager(lease_ttl_s=10)
        await manager.acquire("inc_a", "client_a", "Command Tablet")
        stopped = await manager.release("inc_a")
        assert stopped.enabled is False
        assert stopped.capture_client_id is None
    asyncio.run(scenario())
