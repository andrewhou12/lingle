import { type ScenarioResult, type StatsSummary } from './runner'
import * as fs from 'fs'
import * as path from 'path'

function fmtMs(stats: StatsSummary | null, key: keyof StatsSummary = 'median'): string {
  if (!stats) return '—'.padStart(7)
  return stats[key].toFixed(0).padStart(7)
}

function fmtKB(stats: StatsSummary | null, key: keyof StatsSummary = 'median'): string {
  if (!stats) return '—'.padStart(7)
  return stats[key].toFixed(1).padStart(7)
}

export function printTable(results: ScenarioResult[]): void {
  const header = [
    'Scenario'.padEnd(22),
    'Session'.padStart(7),
    'TTFT'.padStart(7),
    'TTFA'.padStart(7),
    'Sent p50'.padStart(8),
    'Total'.padStart(7),
    'Audio'.padStart(7),
  ].join(' | ')

  const units = [
    ''.padEnd(22),
    '(ms)'.padStart(7),
    '(ms)'.padStart(7),
    '(ms)'.padStart(7),
    '(ms)'.padStart(8),
    '(ms)'.padStart(7),
    '(KB)'.padStart(7),
  ].join(' | ')

  const divider = [22, 7, 7, 7, 8, 7, 7].map((w) => '─'.repeat(w)).join('─┼─')

  console.log('\n' + header)
  console.log(units)
  console.log(divider)

  for (const r of results) {
    const errorCount = r.iterations.filter((i) => i.error).length
    const suffix = errorCount > 0 ? ` (${errorCount} err)` : ''

    const row = [
      (r.scenario.name + suffix).padEnd(22),
      fmtMs(r.stats.sessionCreate),
      fmtMs(r.stats.ttft),
      fmtMs(r.stats.ttfa),
      fmtMs(r.stats.sentenceTtsP50).padStart(8),
      fmtMs(r.stats.total),
      fmtKB(r.stats.audioKB),
    ].join(' | ')

    console.log(row)
  }

  console.log('')
}

export function saveJson(results: ScenarioResult[]): string {
  const dir = path.join(__dirname, 'results')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(dir, `${timestamp}.json`)

  const output = {
    timestamp: new Date().toISOString(),
    results: results.map((r) => ({
      scenario: r.scenario.name,
      type: r.scenario.type,
      mode: r.scenario.mode,
      description: r.scenario.description,
      stats: r.stats,
      iterations: r.iterations.map((iter) => ({
        iteration: iter.iteration,
        sessionCreateMs: iter.sessionCreateMs,
        error: iter.error,
        ...(iter.timings
          ? {
              ttft: iter.timings.firstTextDelta !== null ? iter.timings.firstTextDelta - iter.timings.requestStart : null,
              ttfa: iter.timings.firstAudio !== null ? iter.timings.firstAudio - iter.timings.requestStart : null,
              total: iter.timings.doneTime !== null ? iter.timings.doneTime - iter.timings.requestStart : null,
              audioKB: iter.timings.totalAudioBytes / 1024,
              sentences: iter.timings.sentences.length,
              fullText: iter.timings.fullText,
            }
          : {}),
        ...(iter.ttsTimings
          ? {
              ttfb: iter.ttsTimings.ttfb,
              total: iter.ttsTimings.total,
              audioKB: iter.ttsTimings.bytes / 1024,
            }
          : {}),
      })),
    })),
  }

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2))
  return filePath
}
