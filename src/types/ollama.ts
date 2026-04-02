// Ollama API Types - TypeScript definitions for Ollama's OpenAI-compatible API

/**
 * Ollama API version for compatibility checking
 */
export const OLLAMA_API_VERSION = '0.1.0'

/**
 * Ollama /api/chat request format
 * Based on: https://github.com/ollama/ollama/blob/main/docs/api.md#chat
 */
export interface OllamaChatRequest {
  model: string
  messages: OllamaMessage[]
  stream?: boolean
  options?: OllamaOptions
  format?: 'json' | ''
  tools?: OllamaTool[]
  keep_alive?: number | string
  think?: boolean
}

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  images?: string[]
  thinking?: string
  tool_calls?: OllamaToolCall[]
  tool_call_id?: string
}

export interface OllamaOptions {
  temperature?: number
  top_p?: number
  num_predict?: number // maps from max_tokens
  num_ctx?: number
  stop?: string | string[]
  repeat_penalty?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
}

export interface OllamaTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface OllamaToolCall {
  function: {
    name: string
    arguments: string | Record<string, unknown>
  }
}

/**
 * Ollama /api/chat streaming response format
 * Each SSE event is prefixed with "data: " and terminated with "\n\n"
 */
export interface OllamaChatResponse {
  model: string
  created_at: string
  message: OllamaMessage
  done: boolean
  done_reason?: 'stop' | 'length' | 'tool' | 'model_full'
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

/**
 * Ollama /api/tags response - list available models
 * Based on: https://github.com/ollama/ollama/blob/main/docs/api.md#list-models
 */
export interface OllamaListModelsResponse {
  models: OllamaModelDetails[]
}

export interface OllamaModelDetails {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

/**
 * Ollama /api/show response - get model info
 * Based on: https://github.com/ollama/ollama/blob/main/docs/api.md#show-model-information
 */
export interface OllamaShowModelResponse {
  modelfile: string
  parameters: string
  template: string
  system: string
  details: {
    family: string
    format: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
  model_info?: Record<string, number | string>
  capabilities?: string[]
}

/**
 * Context window size extracted from model info
 */
export interface OllamaModelCapabilities {
  contextWindow: number
  supportsVision: boolean
  supportsTools: boolean
  supportsThinking: boolean
}
