from __future__ import annotations

from collections import deque
from statistics import median


class LatencyMetrics:
    def __init__(self) -> None:
        self.stt: deque[int] = deque(maxlen=100)
        self.parser: deque[int] = deque(maxlen=100)
        self.final_queue_depth = 0
        self.enrichment_queue_depth = 0

    def record_stt(self, value: int) -> None:
        self.stt.append(value)

    def record_parser(self, value: int) -> None:
        self.parser.append(value)

    @staticmethod
    def summary(values: deque[int]) -> tuple[int | None, int | None]:
        return (values[-1], round(median(values))) if values else (None, None)


transcription_metrics = LatencyMetrics()
