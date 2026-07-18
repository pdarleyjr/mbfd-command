"""Benchmark Speaches models against operator-approved MBFD radio fixtures.

Manifest JSONL: {"audio":"clip.wav","reference":"...","units":["E1"]}
Raw audio and transcript text remain local and are never written to the report.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import median
import time

import httpx

MODELS = [
    "Systran/faster-distil-whisper-small.en",
    "Systran/faster-whisper-medium.en",
    "distil-whisper/distil-large-v3",
    "deepdml/faster-whisper-large-v3-turbo-ct2",
]


def edit_distance(left: list[str], right: list[str]) -> int:
    row = list(range(len(right) + 1))
    for index, a in enumerate(left, 1):
        next_row = [index]
        for column, b in enumerate(right, 1):
            next_row.append(min(next_row[-1] + 1, row[column] + 1, row[column - 1] + (a != b)))
        row = next_row
    return row[-1]


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round((len(ordered) - 1) * fraction))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    fixtures = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not fixtures:
        raise SystemExit("Manifest has no approved radio fixtures; refusing to invent benchmark data")
    results = []
    with httpx.Client(timeout=120) as client:
        for model in MODELS:
            latencies: list[float] = []
            errors = words = unit_hits = unit_total = missed = 0
            for fixture in fixtures:
                audio = (args.manifest.parent / fixture["audio"]).read_bytes()
                started = time.perf_counter()
                response = client.post(
                    f"{args.base_url.rstrip('/')}/v1/audio/transcriptions",
                    files={"file": (fixture["audio"], audio, "audio/wav")},
                    data={"model": model, "language": "en", "temperature": "0", "response_format": "json"},
                )
                response.raise_for_status()
                latencies.append((time.perf_counter() - started) * 1000)
                hypothesis = (response.json().get("text") or "").lower().split()
                reference = fixture["reference"].lower().split()
                errors += edit_distance(reference, hypothesis)
                words += len(reference)
                missed += int(not hypothesis)
                for unit in fixture.get("units", []):
                    unit_total += 1
                    unit_hits += int(unit.lower() in " ".join(hypothesis))
            results.append({
                "model": model, "clips": len(fixtures), "wer": errors / max(1, words),
                "unitDesignatorAccuracy": unit_hits / max(1, unit_total),
                "missedTransmissionRate": missed / len(fixtures),
                "falseTransmissionRate": None,
                "medianFinalLatencyMs": round(median(latencies)),
                "p95FinalLatencyMs": round(percentile(latencies, 0.95)),
                "realTimeFactor": None, "cpuUse": None, "memoryUse": None,
            })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"generatedAt": time.time(), "results": results}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
