/**
 * Ollama Client - API interceptor that mimics Anthropic SDK interface
 *
 * This client translates Anthropic API calls into Ollama's OpenAI-compatible
 * API format, enabling transparent use of Ollama as a local AI backend.
 *
 * Architecture:
 * - Mimics `client.beta.messages.create()` interface exactly
 * - Translates request params (Anthropic → Ollama format)
 * - Parses SSE streaming responses
 * - Translates events back to Anthropic format in real-time
 */

import type {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaMessage,
} from 'src/types/ollama.js'
import { getOllamaBaseURL, getOllamaModel, getOllamaModelInfo, extractContextWindow, getToolCapabilityMessage, cacheOllamaModelCapabilities } from 'src/utils/model/ollama.js'
import { formatOllamaConnectionError } from 'src/services/api/errorUtils.js'
import { logForDebugging } from 'src/utils/debug.js'

// Track if we've already warned about tools being disabled for this session
let hasWarnedAboutToolsDisabled = false

/**
 * Strip markdown fences and leading/trailing whitespace from JSON strings.
 * Some Ollama models wrap tool arguments in ```json ... ``` blocks.
 */
function sanitizeJsonString(raw: string): string {
  let s = raw.trim()
  // Strip ```json ... ``` or ``` ... ``` wrappers
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  // Strip single backtick wrappers
  if (s.startsWith('`') && s.endsWith('`')) {
    s = s.slice(1, -1)
  }
  return s.trim()
}

/**
 * Anthropic BetaRawMessageStreamEvent types
 * Based on Anthropic SDK streaming response structure
 */
export type BetaRawMessageStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent

export interface MessageStartEvent {
  type: 'message_start'
  message: {
    id: string
    type: 'message'
    role: 'assistant'
    content: string[]
    model: string
    stop_reason: null
    stop_sequence: null
  }
}

export interface ContentBlockStartEvent {
  type: 'content_block_start'
  index: number
  content_block: {
    type: 'text'
    text: ''
  }
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta'
  index: number
  delta: {
    type: 'text_delta'
    text: string
  }
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop'
  index: number
}

export interface MessageDeltaEvent {
  type: 'message_delta'
  delta: {
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null
  }
  usage: {
    output_tokens: number
  }
}

export interface MessageStopEvent {
  type: 'message_stop'
}

export interface PingEvent {
  type: 'ping'
}

/**
 * Parameters for creating a message - matches Anthropic SDK interface
 */
export interface MessageCreateParams {
  model: string
  max_tokens: number
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string | Array<{ type: 'text' | 'image'; text?: string; source?: { type: string; data: string } }>
  }>
  system?: string | Array<{ type: 'text'; text: string }>
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
  tools?: Array<{
    name: string
    description?: string
    input: Record<string, unknown>
  }>
  tool_choice?: { type: 'auto' | 'any' | 'none' }
  thinking?: {
    type: 'enabled'
    budget_tokens: number
  }
  metadata?: Record<string, string>
}

/**
 * Options for message creation
 */
export interface MessageCreateOptions {
  signal?: AbortSignal
}

/**
 * Result of withResponse() - async generator of stream events
 */
export interface StreamResult {
  data: AsyncGenerator<BetaRawMessageStreamEvent>
}

/**
 * Translates Anthropic params to Ollama /api/chat format
 */
function translateRequestToOllama(
  params: MessageCreateParams,
  contextWindow?: number,
  supportsTools?: boolean,
): OllamaChatRequest {
  const ollamaMessages: OllamaMessage[] = []

  // Handle system message - Ollama uses role: 'system' in messages array
  if (params.system) {
    const systemContent =
      typeof params.system === 'string'
        ? params.system
        : params.system.map((s) => s.text).join('\n')
    ollamaMessages.push({
      role: 'system',
      content: systemContent,
    })
  }

  // Translate conversation messages
  for (const msg of params.messages) {
    if (typeof msg.content === 'string') {
      ollamaMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })
    } else {
      const textParts = msg.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text || '')
        .join('')
      const images = msg.content
        .filter((c: any) => c.type === 'image' && c.source?.data)
        .map((c: any) => c.source!.data)

      // Extract tool_use blocks from assistant messages → Ollama tool_calls
      const toolUseBlocks = msg.content.filter((c: any) => c.type === 'tool_use')
      if (msg.role === 'assistant' && toolUseBlocks.length > 0) {
        const toolCalls = toolUseBlocks.map((tu: any) => {
          // Ollama expects arguments as an object, not a string
          let args: Record<string, unknown>
          if (typeof tu.input === 'string') {
            try { args = JSON.parse(tu.input) } catch { args = {} }
          } else {
            args = tu.input ?? {}
          }
          return {
            function: {
              name: tu.name,
              arguments: args,
            },
          }
        })
        ollamaMessages.push({
          role: 'assistant',
          content: textParts || '',
          tool_calls: toolCalls,
        })
      // Extract tool_result blocks from user messages → Ollama role: 'tool'
      } else {
        const toolResults = msg.content.filter((c: any) => c.type === 'tool_result')
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            let resultContent: string
            if (typeof tr.content === 'string') {
              resultContent = tr.content
            } else if (Array.isArray(tr.content)) {
              resultContent = tr.content.map((c: any) => c.text || '').join('\n')
            } else {
              resultContent = JSON.stringify(tr.content ?? '')
            }
            ollamaMessages.push({
              role: 'tool' as any,
              content: resultContent,
            })
          }
          if (textParts) {
            ollamaMessages.push({ role: 'user', content: textParts })
          }
        } else {
          ollamaMessages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: textParts,
            ...(images.length > 0 ? { images } : {}),
          })
        }
      }
    }
  }

  // Build the base request
  const ollamaRequest: OllamaChatRequest = {
    model: params.model,
    messages: ollamaMessages,
    stream: true,
    options: {
      temperature: params.temperature,
      top_p: params.top_p,
      num_predict: params.max_tokens,
      stop: params.stop_sequences,
      // Enforce context window to prevent silent truncation
      ...(contextWindow && contextWindow > 0 ? { num_ctx: contextWindow } : {}),
    },
  }

  // Translate Anthropic tools to Ollama format (OpenAI-compatible function calling)
  // Anthropic: {name, description?, input_schema}
  // Ollama: {type: "function", function: {name, description?, parameters?}}
  if (supportsTools && params.tools && params.tools.length > 0) {
    ollamaRequest.tools = params.tools.map((tool) => {
      const schema = (tool as any).input_schema ?? (tool as any).input
      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: schema,
        },
      }
    })
  }

  return ollamaRequest
}

/**
 * Maps Ollama done_reason to Anthropic stop_reason
 */
function mapStopReason(
  doneReason?: 'stop' | 'length' | 'tool' | 'model_full',
): 'end_turn' | 'max_tokens' | 'stop_sequence' | null {
  switch (doneReason) {
    case 'stop':
      return 'end_turn'
    case 'length':
      return 'max_tokens'
    case 'model_full':
      return 'end_turn' // Context window exceeded - treated as natural end
    case 'tool':
      return null // Tool calls handled separately
    default:
      return 'end_turn'
  }
}

/**
 * Translates Ollama SSE events to Anthropic BetaRawMessageStreamEvent
 */
function translateEventToAnthropic(
  event: OllamaChatResponse,
  messageId: string,
  model: string,
): BetaRawMessageStreamEvent[] {
  const events: BetaRawMessageStreamEvent[] = []

  // First event: message_start (usage fields required by updateUsage)
  events.push({
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: event.prompt_eval_count || 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  })

  let blockIndex = 0

  // Emit thinking block if the model returned thinking content
  const thinking = event.message.thinking
  if (thinking && thinking.length > 0) {
    events.push({
      type: 'content_block_start',
      index: blockIndex,
      content_block: { type: 'thinking', thinking: '' },
    })
    events.push({
      type: 'content_block_delta',
      index: blockIndex,
      delta: { type: 'thinking_delta', thinking },
    })
    events.push({ type: 'content_block_stop', index: blockIndex })
    blockIndex++
  }

  // Emit text content block if there's text content
  if (event.message.content && event.message.content.length > 0) {
    events.push({
      type: 'content_block_start',
      index: blockIndex,
      content_block: { type: 'text', text: '' },
    })
    events.push({
      type: 'content_block_delta',
      index: blockIndex,
      delta: { type: 'text_delta', text: event.message.content },
    })
    events.push({ type: 'content_block_stop', index: blockIndex })
    blockIndex++
  }

  // Emit tool_use blocks for each tool call
  const toolCalls = event.message.tool_calls ?? []
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name
    let partialJson = ''
    const rawArgs = toolCall.function.arguments
    if (typeof rawArgs === 'string') {
      const cleaned = sanitizeJsonString(rawArgs)
      try {
        JSON.parse(cleaned)
        partialJson = cleaned
      } catch {
        console.warn(`[Ollama] Tool "${toolName}" received invalid JSON arguments:`, rawArgs)
        partialJson = '{}'
      }
    } else if (typeof rawArgs === 'object' && rawArgs !== null) {
      try {
        partialJson = JSON.stringify(rawArgs)
      } catch {
        partialJson = '{}'
      }
    }

    events.push({
      type: 'content_block_start',
      index: blockIndex,
      content_block: { type: 'tool_use', name: toolName, input: '' },
    })
    events.push({
      type: 'content_block_delta',
      index: blockIndex,
      delta: { type: 'input_json_delta', partial_json: partialJson },
    })
    events.push({ type: 'content_block_stop', index: blockIndex })
    blockIndex++
  }

  // If nothing was emitted, emit an empty text block as fallback
  if (blockIndex === 0) {
    events.push({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    })
    events.push({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: event.message.content || '' },
    })
    events.push({ type: 'content_block_stop', index: 0 })
  }

  // Message delta with stop reason
  events.push({
    type: 'message_delta',
    delta: {
      stop_reason: mapStopReason(event.done_reason),
    },
    usage: {
      // Ollama doesn't provide token counts, estimate or use 0
      output_tokens: event.eval_count || 0,
    },
  })

  // Message stop
  events.push({
    type: 'message_stop',
  })

  return events
}

/**
 * Parses NDJSON stream from Ollama response.
 * Ollama sends one JSON object per line (not SSE format).
 * Yields parsed OllamaChatResponse objects.
 * Handles connection drops gracefully.
 */
async function* parseNDJSONStream(
  response: Response,
): AsyncGenerator<OllamaChatResponse> {
  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      let value: Uint8Array | undefined
      try {
        const result = await reader.read()
        value = result.value
        if (result.done) {
          const trimmed = buffer.trim()
          if (trimmed) {
            try {
              yield JSON.parse(trimmed) as OllamaChatResponse
            } catch {
              // Ignore parse errors on final chunk
            }
          }
          break
        }
      } catch {
        console.warn('[Ollama] Connection interrupted while reading stream')
        break
      }

      if (value) {
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            yield JSON.parse(trimmed) as OllamaChatResponse
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // Ignore release errors
    }
  }
}

/**
 * Creates an async generator that yields Anthropic-formatted stream events.
 * Tracks state to emit proper lifecycle: message_start once at the beginning,
 * content_block deltas for each chunk, and message_delta/stop at the end.
 */
async function* createStreamGenerator(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  const messageId = `ollama-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const model = getOllamaModel()

  if (signal?.aborted) {
    return
  }

  const abortHandler = () => {}
  signal?.addEventListener('abort', abortHandler)

  let started = false
  let doneReceived = false
  let textBlockStarted = false
  let thinkingBlockStarted = false
  let nextBlockIndex = 0
  let hasToolCalls = false

  // Ollama streaming format (observed):
  // 1. Thinking chunks: {message: {thinking: "..."}, done: false}
  // 2. Tool calls:      {message: {tool_calls: [...]}, done: false}
  // 3. Text chunks:     {message: {content: "..."}, done: false}
  // 4. Done signal:     {done: true, done_reason: "stop", eval_count: N}

  try {
    for await (const event of parseNDJSONStream(response)) {
      if (signal?.aborted) {
        break
      }

      // Emit message_start on first event
      if (!started) {
        started = true
        yield {
          type: 'message_start',
          message: {
            id: messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model,
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: event.prompt_eval_count || 0,
              output_tokens: 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        } as BetaRawMessageStreamEvent
      }

      // Handle thinking delta (streamed in intermediate events)
      if (event.message?.thinking && !event.done) {
        if (!thinkingBlockStarted) {
          thinkingBlockStarted = true
          yield {
            type: 'content_block_start',
            index: nextBlockIndex,
            content_block: { type: 'thinking', thinking: '', signature: '' },
          } as BetaRawMessageStreamEvent
        }
        yield {
          type: 'content_block_delta',
          index: nextBlockIndex,
          delta: { type: 'thinking_delta', thinking: event.message.thinking },
        } as BetaRawMessageStreamEvent
      }

      // Handle tool calls (appear in intermediate events before done)
      if (event.message?.tool_calls && event.message.tool_calls.length > 0 && !event.done) {
        hasToolCalls = true

        // Close thinking block if open
        if (thinkingBlockStarted) {
          yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
          nextBlockIndex++
          thinkingBlockStarted = false
        }

        // Open a text block for any preceding text, then close it
        if (!textBlockStarted) {
          yield {
            type: 'content_block_start',
            index: nextBlockIndex,
            content_block: { type: 'text', text: '' },
          } as BetaRawMessageStreamEvent
          yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
          nextBlockIndex++
        } else {
          yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
          nextBlockIndex++
          textBlockStarted = false
        }

        const toolCalls = event.message.tool_calls
        logForDebugging(`[Ollama] Response contains ${toolCalls.length} tool call(s): ${toolCalls.map(tc => tc.function.name).join(', ')}`)

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name
          let partialJson = ''
          const rawArgs = toolCall.function.arguments
          if (typeof rawArgs === 'string') {
            const cleaned = sanitizeJsonString(rawArgs)
            try {
              JSON.parse(cleaned)
              partialJson = cleaned
            } catch {
              partialJson = '{}'
            }
          } else if (typeof rawArgs === 'object' && rawArgs !== null) {
            try { partialJson = JSON.stringify(rawArgs) } catch { partialJson = '{}' }
          }

          const toolUseId = `ollama_tool_${Date.now()}_${nextBlockIndex}`
          yield {
            type: 'content_block_start',
            index: nextBlockIndex,
            content_block: { type: 'tool_use', id: toolUseId, name: toolName, input: '' },
          } as BetaRawMessageStreamEvent
          yield {
            type: 'content_block_delta',
            index: nextBlockIndex,
            delta: { type: 'input_json_delta', partial_json: partialJson },
          } as BetaRawMessageStreamEvent
          yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
          nextBlockIndex++
        }
      }

      // Handle text content delta (streamed in intermediate events)
      if (event.message?.content && !event.done) {
        // Close thinking block before starting text
        if (thinkingBlockStarted) {
          yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
          nextBlockIndex++
          thinkingBlockStarted = false
        }
        if (!textBlockStarted) {
          textBlockStarted = true
          yield {
            type: 'content_block_start',
            index: nextBlockIndex,
            content_block: { type: 'text', text: '' },
          } as BetaRawMessageStreamEvent
        }
        yield {
          type: 'content_block_delta',
          index: nextBlockIndex,
          delta: { type: 'text_delta', text: event.message.content },
        } as BetaRawMessageStreamEvent
      }

      // Handle done event - close all open blocks
      if (event.done) {
        doneReceived = true

        // Close any open thinking block
        if (thinkingBlockStarted) {
          yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
          nextBlockIndex++
        }

        // Close any open text block
        if (textBlockStarted) {
          yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
          nextBlockIndex++
        }

        // If nothing was emitted, ensure at least an empty text block
        if (nextBlockIndex === 0) {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          } as BetaRawMessageStreamEvent
          yield { type: 'content_block_stop', index: 0 } as BetaRawMessageStreamEvent
          nextBlockIndex = 1
        }

        const stopReason = hasToolCalls ? 'tool_use' : mapStopReason(event.done_reason)
        yield {
          type: 'message_delta',
          delta: { stop_reason: stopReason },
          usage: { output_tokens: event.eval_count || 0 },
        } as BetaRawMessageStreamEvent

        yield { type: 'message_stop' } as BetaRawMessageStreamEvent
        break
      }
    }

    // If stream ended without a done event, close cleanly
    if (started && !doneReceived) {
      if (thinkingBlockStarted) {
        yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
        nextBlockIndex++
      }
      if (textBlockStarted) {
        yield { type: 'content_block_stop', index: nextBlockIndex } as BetaRawMessageStreamEvent
        nextBlockIndex++
      }
      if (nextBlockIndex === 0) {
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        } as BetaRawMessageStreamEvent
        yield { type: 'content_block_stop', index: 0 } as BetaRawMessageStreamEvent
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 0 },
      } as BetaRawMessageStreamEvent
      yield { type: 'message_stop' } as BetaRawMessageStreamEvent
    }
  } finally {
    signal?.removeEventListener('abort', abortHandler)
  }
}

/**
 * Factory function to create an Ollama client with Anthropic SDK-compatible interface
 *
 * Usage:
 *   const ollamaClient = createOllamaClient()
 *   const response = await ollamaClient.beta.messages.create(
 *     { model: 'claude-3-5-sonnet', messages: [...], max_tokens: 1024 },
 *     { signal: abortController.signal }
 *   )
 *   const { data } = await response.withResponse()
 *   for await (const event of data) {
 *     // Handle event
 *   }
 */
export function createOllamaClient(): {
  beta: {
    messages: {
      create: (
        params: MessageCreateParams,
        options?: MessageCreateOptions,
      ) => {
        withResponse: () => Promise<StreamResult>
      }
    }
  }
} {
  return {
    beta: {
      messages: {
        create: (params: MessageCreateParams, options?: MessageCreateOptions) => {
          return {
            withResponse: async (): Promise<StreamResult> => {
              const baseURL = getOllamaBaseURL()

              // Fetch model info to get context window and tool capability
              // This prevents silent truncation when context exceeds model's limit
              // and ensures tools are only sent to models that support them
              let contextWindow: number | undefined
              let supportsTools = false
              const modelInfo = await getOllamaModelInfo(params.model)
              if (modelInfo !== null) {
                const extracted = extractContextWindow(modelInfo)
                contextWindow = extracted.contextWindow
                supportsTools = extracted.supportsTools ?? false
                cacheOllamaModelCapabilities(params.model, extracted)

                // Warn once per session when tools are disabled
                if (!supportsTools && !hasWarnedAboutToolsDisabled && params.tools && params.tools.length > 0) {
                  const { message } = getToolCapabilityMessage(modelInfo)
                  console.warn(`[Ollama] ${message}`)
                  hasWarnedAboutToolsDisabled = true
                }
              } else {
                // Model info fetch failed - continue without num_ctx and without tools (safer defaults)
                console.warn(`[Ollama] Failed to get model info for ${params.model}, proceeding without num_ctx and without tools`)
              }

              const ollamaRequest = translateRequestToOllama(params, contextWindow, supportsTools)

              // Debug: log tool count, message roles, and tool names
              const msgRoles = ollamaRequest.messages.map(m => {
                const extra = (m as any).tool_calls ? `+${(m as any).tool_calls.length}tc` : ''
                return `${m.role}${extra}`
              }).join(',')
              logForDebugging(`[Ollama] Messages: [${msgRoles}]`)
              if (ollamaRequest.tools && ollamaRequest.tools.length > 0) {
                const toolNames = ollamaRequest.tools.map(t => t.function.name).join(', ')
                logForDebugging(`[Ollama] Sending ${ollamaRequest.tools.length} tools: ${toolNames}`)
              } else {
                logForDebugging(`[Ollama] No tools sent (supportsTools=${supportsTools}, requested=${params.tools?.length ?? 0})`)
              }

              const fetchOptions: RequestInit = {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(ollamaRequest),
                signal: options?.signal,
              }

              let response: Response
              try {
                response = await fetch(`${baseURL}/api/chat`, fetchOptions)
              } catch (error) {
                throw new Error(formatOllamaConnectionError(error, baseURL))
              }

              if (!response.ok) {
                let errorMessage = `Ollama API error: ${response.status}`
                try {
                  const errorBody = await response.text()
                  const parsed = JSON.parse(errorBody)
                  if (parsed.error) {
                    errorMessage = typeof parsed.error === 'string'
                      ? parsed.error
                      : parsed.error.message || errorMessage
                  }
                } catch {
                  // Use status-based message
                }
                throw new Error(errorMessage)
              }

              const streamGenerator = createStreamGenerator(
                response,
                options?.signal,
              )

              return {
                data: streamGenerator,
              }
            },
          }
        },
      },
    },
  }
}

/**
 * Convenience function to check if Ollama is available
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const baseURL = getOllamaBaseURL()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const response = await fetch(`${baseURL}/api/tags`, {
      signal: controller.signal,
    })

    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}
