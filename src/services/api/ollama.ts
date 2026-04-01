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
import { getOllamaBaseURL, getOllamaModel, getOllamaModelInfo, extractContextWindow } from 'src/utils/model/ollama.js'
import { formatOllamaConnectionError } from 'src/services/api/errorUtils.js'

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
      // Handle content blocks (images, text)
      const textParts = msg.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text || '')
        .join('')
      ollamaMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: textParts,
      })
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

  // Translate Anthropic tools to Ollama format
  // Anthropic: {name, description?, input}
  // Ollama: {type: "function", function: {name, description?, parameters?}}
  // Only include tools if the model supports them
  if (supportsTools && params.tools && params.tools.length > 0) {
    ollamaRequest.tools = params.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input,
      },
    }))
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

  // First event: message_start
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
    },
  })

  // Check if this is a tool call response
  const hasToolCalls =
    event.message.tool_calls && event.message.tool_calls.length > 0

  if (hasToolCalls) {
    // Tool call detected - emit tool_use content block sequence
    const toolCall = event.message.tool_calls![0]
    const toolName = toolCall.function.name

    // Parse arguments - Ollama returns arguments as JSON string or object
    let partialJson = ''
    const args = toolCall.function.arguments
    if (typeof args === 'string') {
      // Arguments is a JSON string - parse and re-stringify to validate
      try {
        JSON.parse(args) // Validate it's valid JSON
        partialJson = args
      } catch {
        // Invalid JSON, emit empty partial
        console.warn(
          `[Ollama] Tool "${toolName}" received invalid JSON arguments:`,
          args,
        )
        partialJson = ''
      }
    } else if (typeof args === 'object' && args !== null) {
      // Arguments is already an object - stringify to JSON
      try {
        partialJson = JSON.stringify(args)
      } catch {
        partialJson = ''
      }
    }

    // Content block start with tool_use type
    events.push({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        name: toolName,
        input: '',
      },
    })

    // Content block delta with input_json_delta
    events.push({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: partialJson,
      },
    })

    // Content block stop
    events.push({
      type: 'content_block_stop',
      index: 0,
    })
  } else {
    // No tool call - emit text content block (existing behavior)
    events.push({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'text',
        text: '',
      },
    })

    // Content delta - the actual message content
    if (event.message.content) {
      events.push({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: event.message.content,
        },
      })
    }

    // Content block stop
    events.push({
      type: 'content_block_stop',
      index: 0,
    })
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
 * Parses SSE stream from Ollama response
 * Yields parsed OllamaChatResponse objects
 */
async function* parseSSEStream(
  response: Response,
): AsyncGenerator<OllamaChatResponse> {
  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        // Process any remaining buffer
        if (buffer.startsWith('data: ')) {
          try {
            yield JSON.parse(buffer.slice(6)) as OllamaChatResponse
          } catch {
            // Ignore parse errors on final chunk
          }
        }
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            return
          }
          try {
            yield JSON.parse(data) as OllamaChatResponse
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Creates an async generator that yields Anthropic-formatted stream events
 */
async function* createStreamGenerator(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  const messageId = `ollama-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const model = getOllamaModel()

  // Handle abort signal
  if (signal?.aborted) {
    return
  }

  const abortHandler = () => {
    // Note: We can't directly abort the stream, but we can stop reading
    // The stream will be cleaned up when the generator is closed
  }
  signal?.addEventListener('abort', abortHandler)

  try {
    for await (const event of parseSSEStream(response)) {
      if (signal?.aborted) {
        break
      }

      const anthropicEvents = translateEventToAnthropic(event, messageId, model)
      for (const e of anthropicEvents) {
        yield e
      }

      // If Ollama signals done, stop after yielding final events
      if (event.done) {
        break
      }
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
              try {
                const modelInfo = await getOllamaModelInfo(params.model)
                const extracted = extractContextWindow(modelInfo)
                contextWindow = extracted.contextWindow
                supportsTools = extracted.supportsTools ?? false
              } catch {
                // Model info fetch failed - continue without num_ctx and without tools (safer defaults)
                console.warn(`[Ollama] Failed to get model info for ${params.model}, proceeding without num_ctx and without tools`)
              }

              const ollamaRequest = translateRequestToOllama(params, contextWindow, supportsTools)

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
