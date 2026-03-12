# Voice Latency Benchmark

CLI tool for measuring voice pipeline latency without a browser or microphone. Simulates user messages, hits the real API routes, parses the binary voice-stream protocol, and reports timing at every stage.

## Prerequisites

1. **Dev server running**: `pnpm dev:web`
2. **Test user account**: A Supabase user with a completed learner profile
3. **Environment variables** (in `apps/web/.env.local` or exported):

```bash
# Required
BENCH_USER_EMAIL=your-test-user@example.com
BENCH_USER_PASSWORD=your-test-password

# Already needed by the app
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...
CARTESIA_API_KEY=...
CARTESIA_VOICE_JA=...

# Optional
BENCH_BASE_URL=http://localhost:3000   # default
```

## Usage

```bash
# Run all scenarios
npx tsx scripts/voice-latency-bench.ts

# Filter by scenario name (substring match)
npx tsx scripts/voice-latency-bench.ts --scenario=cold

# Override iteration count
npx tsx scripts/voice-latency-bench.ts --iterations=5

# Verbose mode — prints per-frame and per-sentence timing
npx tsx scripts/voice-latency-bench.ts --verbose

# Combine options
npx tsx scripts/voice-latency-bench.ts --scenario=tts --iterations=10 --verbose

# Help
npx tsx scripts/voice-latency-bench.ts --help
```

## Scenarios

| Name | Type | Description |
|------|------|-------------|
| `cold-short` | voice-stream | New session, short message |
| `cold-medium` | voice-stream | New session, 1-2 sentence message |
| `warm-turn-2` | voice-stream | 2nd turn (prompt cache warm) |
| `warm-turn-5` | voice-stream | 5th turn (longer context) |
| `tutor-cold` | voice-stream | Tutor mode cold start |
| `tts-short` | tts-only | Isolated TTS, short sentence |
| `tts-long` | tts-only | Isolated TTS, paragraph |

**voice-stream** scenarios test the full pipeline: session creation → LLM streaming → per-sentence TTS → binary frame encoding.

**tts-only** scenarios isolate Cartesia TTS latency by hitting `/api/tts/stream` directly.

## Output

### Console table

```
Scenario               | Session |    TTFT |    TTFA | Sent p50 |   Total |   Audio
                       |    (ms) |    (ms) |    (ms) |     (ms) |    (ms) |    (KB)
───────────────────────┼─────────┼─────────┼─────────┼──────────┼─────────┼────────
cold-short             |    1234 |     456 |     789 |      234 |    3456 |   45.2
warm-turn-2            |    1100 |     312 |     634 |      198 |    2890 |   51.3
tts-short              |       — |       — |      87 |        — |     234 |   12.3
```

- **Session**: Time to create the session (plan generation via Haiku)
- **TTFT**: Time to first text delta from LLM
- **TTFA**: Time to first audio byte
- **Sent p50**: Median per-sentence TTS latency (SENTENCE_START → first AUDIO frame)
- **Total**: Total time from request to DONE frame
- **Audio**: Total audio data in KB

All values are medians across iterations.

### JSON results

Full results are saved to `scripts/bench/results/<timestamp>.json` with per-iteration breakdowns including full response text, sentence-level timing, and error details.

## Verbose mode

With `--verbose`, each iteration prints:
- Session ID and plan topic
- Per-turn TTFT, TTFA, and total
- Full response text (truncated)
- Per-sentence TTS latency and audio size

Example:
```
  [1/3]
    Session: abc-123 (1234ms)
    Plan: Weekend plans with a friend
    Warmup turn 1...
    Warmup 1 done: "そうですね、週末は..."
    TTFT: 456ms | TTFA: 789ms | Total: 3456ms
    Text: "いいですね！私も映画を見たいです。最近..."
    Sentences: 3 | Audio: 45.2KB
      "いいですね！" → TTS: 87ms, 12.1KB
      "私も映画を見たいです。" → TTS: 134ms, 18.4KB
      "最近はどんな映画が好きですか？" → TTS: 156ms, 14.7KB
```

## Architecture

```
scripts/
  voice-latency-bench.ts       # CLI entry point, arg parsing
  bench/
    auth.ts                    # Supabase sign-in → cookie string
    frame-parser.ts            # Binary protocol parser with timing
    scenarios.ts               # Test scenario definitions
    runner.ts                  # Orchestrates scenarios, collects metrics
    reporter.ts                # Console table + JSON output
    results/                   # JSON output (gitignored)
```

The benchmark authenticates as a real user, creates real sessions, and streams real LLM + TTS responses. This tests the identical code path the browser uses.

## Tips

- Run `--scenario=tts-short` first to verify basic connectivity
- Compare TTFT/TTFA numbers against the server-side `[voice-stream:timing]` logs to see client vs server overhead
- Use `--iterations=10` for more stable medians when comparing optimizations
- Warm scenarios test prompt caching effectiveness — TTFT should drop significantly after the first turn
