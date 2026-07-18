import asyncio

from app.realtime.hub import IncidentHub


class FakeSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, payload):
        self.messages.append(payload)


def test_hub_never_fans_events_into_another_incident():
    async def scenario():
        hub = IncidentHub()
        same_a, same_b, other = FakeSocket(), FakeSocket(), FakeSocket()
        await hub.connect("inc-a", same_a)
        await hub.connect("inc-a", same_b)
        await hub.connect("inc-b", other)
        await hub.broadcast("inc-a", {"type": "event", "incidentId": "inc-a"})
        assert len(same_a.messages) == len(same_b.messages) == 1
        assert other.messages == []

    asyncio.run(scenario())
