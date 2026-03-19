/**
 * Inspect the full agent system prompt from AgentMetadata.
 *
 * Usage:
 *   # From a test-plan response:
 *   curl -s -X POST localhost:3000/api/dev/test-plan | npx tsx scripts/inspect-agent-prompt.ts
 *
 *   # From a JSON file:
 *   npx tsx scripts/inspect-agent-prompt.ts metadata.json
 *
 * Reads AgentMetadata (from the `agentMetadata` field) and prints the full
 * 6-slot system prompt that the agent would use.
 */
import { buildSystemPrompt } from '../apps/agent/src/lingle-agent.js'
import type { AgentMetadata } from '../apps/agent/src/config.js'
import { readFileSync } from 'fs'

async function main() {
  let input: string

  const arg = process.argv[2]
  if (arg && arg !== '-') {
    input = readFileSync(arg, 'utf-8')
  } else {
    // Read from stdin
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    input = Buffer.concat(chunks).toString('utf-8')
  }

  const parsed = JSON.parse(input)
  // Support both raw AgentMetadata and a wrapper with { agentMetadata: ... }
  const metadata: AgentMetadata = parsed.agentMetadata ?? parsed

  // Fill in required fields with defaults if missing
  if (!metadata.sessionId) metadata.sessionId = 'dev-inspect'
  if (!metadata.userId) metadata.userId = 'dev-inspect'
  if (!metadata.targetLanguage) metadata.targetLanguage = 'Japanese'
  if (!metadata.nativeLanguage) metadata.nativeLanguage = 'English'

  const prompt = buildSystemPrompt(metadata)
  const estimatedTokens = Math.ceil(prompt.length / 4)

  console.log('═'.repeat(72))
  console.log('AGENT SYSTEM PROMPT')
  console.log(`Estimated tokens: ~${estimatedTokens}`)
  console.log('═'.repeat(72))
  console.log()
  console.log(prompt)
  console.log()
  console.log('═'.repeat(72))
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
