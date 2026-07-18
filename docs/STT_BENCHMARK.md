# MBFD radio STT benchmark

The benchmark harness compares the four directive-specified faster-whisper families using human-reviewed MBFD radio clips. It reports WER, unit-designator accuracy, missed-transmission rate, and final latency. It deliberately refuses to run with an empty manifest and never copies raw audio or transcript text into its result file.

No representative radio recordings were present in the repository, so no model ranking is asserted here. A generic speech corpus would not validate MBFD unit recognition and would create misleading operational evidence.

Run on the GMKtec against its Speaches service:

```powershell
python api/scripts/benchmark_stt.py --manifest api/tests/fixtures/radio/manifest.jsonl --base-url http://127.0.0.1:8000 --output data/stt-benchmark.json
```

Before changing `CMD_WHISPER_MODEL`, review at least: current small.en, medium.en, distil-large-v3, and large-v3-turbo. Reject any candidate that improves generic WER while reducing unit-designator accuracy. Record CPU and memory from the host during each run; the harness leaves those fields null rather than guessing platform telemetry.
