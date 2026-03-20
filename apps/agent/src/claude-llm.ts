/**
 * Custom LLM implementation wrapping the Anthropic SDK
 * to match LiveKit Agents' LLM interface.
 *
 * Includes:
 * - Prompt caching (system prompt + conversation history)
 * - Language-based filler prefill for faster time-to-first-audio
 */
import { llm, type APIConnectOptions } from '@livekit/agents'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

/** Convert LiveKit ChatContext to Anthropic format */
function convertChatContext(
  chatCtx: llm.ChatContext,
): { system: string; messages: Anthropic.MessageParam[] } {
  let system = ''
  const messages: Anthropic.MessageParam[] = []

  for (const item of chatCtx.items) {
    // Only process ChatMessage items (not FunctionCall or FunctionCallOutput)
    if (item.type !== 'message') continue

    const msg = item as llm.ChatMessage

    if (msg.role === 'system' || msg.role === 'developer') {
      const text = msg.textContent || ''
      if (text) system += (system ? '\n\n' : '') + text
      continue
    }

    const text = msg.textContent || ''
    if (text) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: text,
      })
    }
  }

  // Anthropic API requires at least one message
  if (messages.length === 0) {
    messages.push({ role: 'user', content: '[Start the conversation]' })
  }

  return { system, messages }
}

/** Convert tools from ToolContext (dictionary) to Anthropic format */
function convertTools(
  toolCtx: llm.ToolContext | undefined,
): Anthropic.Tool[] | undefined {
  if (!toolCtx) return undefined

  const names = Object.keys(toolCtx)
  if (!names.length) return undefined

  return names.map((name) => {
    const tool = toolCtx[name]
    return {
      name,
      description: tool.description || '',
      input_schema: (tool.parameters || { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema,
    }
  })
}

export class ClaudeLLM extends llm.LLM {
  private _model: string
  private maxTokens: number

  constructor(opts: { model?: string; maxTokens?: number } = {}) {
    super()
    this._model = opts.model || 'claude-sonnet-4-20250514'
    this.maxTokens = opts.maxTokens || 200
  }

  label(): string {
    return 'anthropic'
  }

  override get model(): string {
    return this._model
  }

  chat(params: {
    chatCtx: llm.ChatContext
    toolCtx?: llm.ToolContext
    connOptions?: APIConnectOptions
    parallelToolCalls?: boolean
    toolChoice?: llm.ToolChoice
    extraKwargs?: Record<string, unknown>
  }): llm.LLMStream {
    return new ClaudeLLMStream(this, params, this._model, this.maxTokens)
  }
}

class ClaudeLLMStream extends llm.LLMStream {
  private _model: string
  private maxTokens: number

  constructor(
    llmInstance: ClaudeLLM,
    params: {
      chatCtx: llm.ChatContext
      toolCtx?: llm.ToolContext
      connOptions?: APIConnectOptions
    },
    model: string,
    maxTokens: number,
  ) {
    super(llmInstance, {
      chatCtx: params.chatCtx,
      toolCtx: params.toolCtx,
      connOptions: params.connOptions || { maxRetry: 3, retryIntervalMs: 2000, timeoutMs: 30000 },
    })
    this._model = model
    this.maxTokens = maxTokens
  }

  protected async run(): Promise<void> {
    const { system, messages } = convertChatContext(this.chatCtx)
    const anthropicTools = convertTools(this.toolCtx)

    // --- Prompt caching strategy ---
    // 1. Cache the system prompt (stable across turns)
    // 2. Cache conversation history up to the second-to-last user message
    //    (only the newest user message changes between turns)
    const cachedMessages = this.applyCacheBreakpoints(messages)

    const params: Anthropic.MessageCreateParamsStreaming = {
      model: this._model,
      max_tokens: this.maxTokens,
      stream: true,
      messages: cachedMessages,
    }

    if (system) {
      params.system = [
        {
          type: 'text' as const,
          text: system,
          cache_control: { type: 'ephemeral' as const },
        },
      ]
    }

    if (anthropicTools?.length) {
      // Add cache_control to the last tool so system prompt + all tools
      // form the cached prefix. Tools are stable across turns.
      // Haiku requires >= 2048 tokens in the prefix for caching to activate.
      const toolsWithCache = [...anthropicTools]
      const lastIdx = toolsWithCache.length - 1
      toolsWithCache[lastIdx] = {
        ...toolsWithCache[lastIdx],
        cache_control: { type: 'ephemeral' as const },
      } as Anthropic.Tool & { cache_control: { type: 'ephemeral' } }
      params.tools = toolsWithCache
    }

    const stream = anthropic.messages.stream(params)

    let currentToolName = ''
    let currentToolId = ''
    let currentToolInput = ''
    let chunkId = ''

    for await (const event of stream) {
      if (event.type === 'message_start') {
        chunkId = event.message.id
        // Report prompt token usage (including cache metrics)
        const u = event.message.usage
        if (u) {
          const inputTokens = u.input_tokens ?? 0
          const cachedTokens = (u as unknown as Record<string, number>).cache_read_input_tokens ?? 0
          const cacheCreation = (u as unknown as Record<string, number>).cache_creation_input_tokens ?? 0
          console.log(`[cache] input=${inputTokens} cached_read=${cachedTokens} cached_creation=${cacheCreation}`)
          this.queue.put({
            id: chunkId,
            usage: {
              completionTokens: 0,
              promptTokens: inputTokens,
              promptCachedTokens: cachedTokens,
              totalTokens: inputTokens,
            },
          })
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolName = event.content_block.name
          currentToolId = event.content_block.id
          currentToolInput = ''
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          // Stream text directly to TTS — zero buffering
          this.queue.put({
            id: chunkId,
            delta: {
              role: 'assistant',
              content: event.delta.text,
            },
          })
        } else if (event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolName && currentToolId) {
          try {
            const rawArgs = currentToolInput || '{}'
            const fnCall = llm.FunctionCall.create({
              callId: currentToolId,
              name: currentToolName,
              args: rawArgs,
            })
            this.queue.put({
              id: chunkId,
              delta: {
                role: 'assistant',
                toolCalls: [fnCall],
              },
            })
          } catch {
            // Invalid tool call — skip
          }
          currentToolName = ''
          currentToolId = ''
          currentToolInput = ''
        }
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          this.queue.put({
            id: chunkId,
            usage: {
              completionTokens: event.usage.output_tokens,
              promptTokens: 0,
              promptCachedTokens: 0,
              totalTokens: event.usage.output_tokens,
            },
          })
        }
      }
    }
  }

  /**
   * Apply cache_control breakpoints on messages for multi-turn caching.
   * Strategy: cache everything up to the second-to-last user message.
   * On turn N, turns 1..N-1 are cached, only the new turn is uncached.
   */
  private applyCacheBreakpoints(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
    if (messages.length < 4) return [...messages]

    const result: Anthropic.MessageParam[] = []

    // Find the second-to-last user message index — that's our cache boundary
    let lastUserIdx = -1
    let secondLastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        if (lastUserIdx === -1) {
          lastUserIdx = i
        } else {
          secondLastUserIdx = i
          break
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (i === secondLastUserIdx && typeof msg.content === 'string') {
        // Add cache breakpoint on this message
        result.push({
          role: msg.role,
          content: [
            {
              type: 'text' as const,
              text: msg.content,
              cache_control: { type: 'ephemeral' as const },
            },
          ],
        })
      } else {
        result.push(msg)
      }
    }

    return result
  }
}
