/**
 * Custom LLM implementation wrapping the Anthropic SDK
 * to match LiveKit Agents' LLM interface.
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

    const params: Anthropic.MessageCreateParamsStreaming = {
      model: this._model,
      max_tokens: this.maxTokens,
      stream: true,
      messages,
    }

    if (system) {
      // Use prompt caching for the system prompt to reduce latency on subsequent turns
      params.system = [
        {
          type: 'text' as const,
          text: system,
          cache_control: { type: 'ephemeral' as const },
        },
      ]
    }

    if (anthropicTools?.length) {
      params.tools = anthropicTools
    }

    const stream = anthropic.messages.stream(params)

    let currentToolName = ''
    let currentToolId = ''
    let currentToolInput = ''
    let chunkId = ''

    for await (const event of stream) {
      if (event.type === 'message_start') {
        chunkId = event.message.id
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolName = event.content_block.name
          currentToolId = event.content_block.id
          currentToolInput = ''
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
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
            // Create a FunctionCall instance for the toolCalls array
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
}
