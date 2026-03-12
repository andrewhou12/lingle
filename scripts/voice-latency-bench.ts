#!/usr/bin/env npx tsx
/**
 * Voice pipeline latency benchmark.
 *
 * Usage:
 *   npx tsx scripts/voice-latency-bench.ts                   # all scenarios
 *   npx tsx scripts/voice-latency-bench.ts --scenario=cold   # filter by name
 *   npx tsx scripts/voice-latency-bench.ts --iterations=5    # override count
 *   npx tsx scripts/voice-latency-bench.ts --verbose         # print each frame
 *
 * Required env vars:
 *   BENCH_USER_EMAIL, BENCH_USER_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Optional:
 *   BENCH_BASE_URL (default: http://localhost:3000)
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env from the web app
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env') })

import { SCENARIOS } from './bench/scenarios'
import { runBenchmark } from './bench/runner'
import { printTable, saveJson } from './bench/reporter'

function parseArgs(): { scenario?: string; iterations?: number; verbose: boolean } {
  const args = process.argv.slice(2)
  let scenario: string | undefined
  let iterations: number | undefined
  let verbose = false

  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      scenario = arg.split('=')[1]
    } else if (arg.startsWith('--iterations=')) {
      iterations = parseInt(arg.split('=')[1], 10)
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Voice Pipeline Latency Benchmark

Usage:
  npx tsx scripts/voice-latency-bench.ts [options]

Options:
  --scenario=<name>    Filter scenarios by name (substring match)
  --iterations=<n>     Override iteration count for all scenarios
  --verbose, -v        Print detailed per-frame timing
  --help, -h           Show this help

Scenarios:
${SCENARIOS.map((s) => `  ${s.name.padEnd(16)} ${s.type.padEnd(14)} ${s.description}`).join('\n')}

Env vars:
  BENCH_USER_EMAIL       Supabase test user email
  BENCH_USER_PASSWORD    Supabase test user password
  BENCH_BASE_URL         Server URL (default: http://localhost:3000)
`)
      process.exit(0)
    }
  }

  return { scenario, iterations, verbose }
}

async function main() {
  const opts = parseArgs()

  // Filter scenarios
  let scenarios = SCENARIOS
  if (opts.scenario) {
    scenarios = scenarios.filter((s) => s.name.includes(opts.scenario!))
    if (scenarios.length === 0) {
      console.error(`No scenarios matching "${opts.scenario}"`)
      console.error(`Available: ${SCENARIOS.map((s) => s.name).join(', ')}`)
      process.exit(1)
    }
  }

  console.log(`Running ${scenarios.length} scenario(s)...`)
  console.log(`Base URL: ${process.env.BENCH_BASE_URL || 'http://localhost:3000'}`)

  const results = await runBenchmark(scenarios, {
    verbose: opts.verbose,
    iterationOverride: opts.iterations,
  })

  printTable(results)

  const jsonPath = saveJson(results)
  console.log(`Results saved to ${jsonPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
