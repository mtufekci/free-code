import { isEnvTruthy } from '../envUtils.js'
import { which } from '../which.js'
import type {
  OllamaListModelsResponse,
  OllamaShowModelResponse,
  OllamaModelCapabilities,
} from '../../types/ollama.js'

/**
 * Represents Ollama availability detected on the system.
 */
export type OllamaAvailability = {
  hasCli: boolean
  hasBaseUrl: boolean
  baseUrl: string | null
}

/**
 * Detect Ollama availability on the system.
 * Checks for CLI presence and OLLAMA_BASE_URL environment variable.
 */
export async function detectOllamaAvailability(): Promise<OllamaAvailability> {
  const baseUrl = process.env.OLLAMA_BASE_URL || null
  const hasBaseUrl = Boolean(baseUrl)
  const hasCli = (await which('ollama')) !== null

  return {
    hasCli,
    hasBaseUrl,
    baseUrl,
  }
}

/**
 * Determine if we should suggest enabling Ollama.
 * Returns true if Ollama is available (CLI or URL) but not yet enabled.
 */
export async function shouldSuggestOllama(): Promise<boolean> {
  // If already enabled, don't suggest
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_OLLAMA)) {
    return false
  }

  const availability = await detectOllamaAvailability()
  return availability.hasCli || availability.hasBaseUrl
}

/**
 * Check if Ollama is enabled via environment variable.
 */
export function isOllamaEnabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_OLLAMA)
}

/**
 * Get the Ollama base URL for API requests.
 * Defaults to http://localhost:11434 if not configured.
 */
export function getOllamaBaseURL(): string {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
}

/**
 * Get the Ollama model name.
 * Defaults to 'minimax-2.7' if not configured.
 */
export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || 'minimax-m2.7:cloud'
}

/**
 * Check if Ollama is reachable at the configured base URL.
 * Uses a HEAD request with a 5-second timeout to check TCP reachability.
 * Does not check API validity - only connectivity.
 */
export async function checkOllamaConnection(): Promise<{
  reachable: boolean
  error?: 'timeout' | 'rate_limited' | 'connection' | string
}> {
  const baseURL = getOllamaBaseURL()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(baseURL, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timeout)
    if (response.status === 429) {
      return { reachable: false, error: 'rate_limited' }
    }
    return { reachable: true }
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { reachable: false, error: 'timeout' }
      }
      return { reachable: false, error: 'connection' }
    }
    return { reachable: false, error: 'unknown error' }
  }
}

/**
 * Normalize model string for Ollama API.
 * Some models may need tag adjustments.
 *
 * @param model - Model name string (e.g., 'minimax-2.7', 'claude-3-5-sonnet')
 * @returns Normalized model name for Ollama API
 */
export function normalizeOllamaModelName(model: string): string {
  // Ollama model strings can include tags like :latest, :q4_0, etc.
  // Pass through as-is for now, can add normalization later
  // e.g., could strip provider prefixes like 'anthropic/' if needed
  return model
}

/**
 * List all available Ollama models.
 * Calls GET /api/tags endpoint.
 * Returns empty models array if Ollama returns empty or invalid response.
 */
export async function listOllamaModels(): Promise<OllamaListModelsResponse> {
  const baseURL = getOllamaBaseURL()
  try {
    const response = await fetch(`${baseURL}/api/tags`)

    if (!response.ok) {
      return { models: [] }
    }

    const data = await response.json() as OllamaListModelsResponse
    return { models: data.models || [] }
  } catch {
    return { models: [] }
  }
}

/**
 * Get detailed information about a specific Ollama model.
 * Includes context window size and capabilities.
 * Returns null if model lookup fails (e.g., model doesn't exist).
 */
export async function getOllamaModelInfo(modelName: string): Promise<OllamaShowModelResponse | null> {
  const baseURL = getOllamaBaseURL()
  try {
    const response = await fetch(`${baseURL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    })

    if (!response.ok) {
      return null
    }

    return response.json() as Promise<OllamaShowModelResponse>
  } catch {
    return null
  }
}

/**
 * Extract context window size and capabilities from Ollama model info.
 * Falls back to default (4096) if not determinable.
 *
 * Ollama provides capabilities in two ways:
 * 1. Top-level `capabilities` array: ["completion", "tools", "vision", "thinking"]
 * 2. Architecture-prefixed keys in `model_info`: e.g. "llama.context_length", "deepseekocr.vision.block_count"
 */
export function extractContextWindow(modelInfo: OllamaShowModelResponse | null | undefined): OllamaModelCapabilities {
  const DEFAULT_CONTEXT_WINDOW = 4096

  if (!modelInfo) {
    return {
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      supportsVision: false,
      supportsTools: false,
      supportsThinking: false,
    }
  }

  // Extract context_length from model_info (keys are architecture-prefixed, e.g. "llama.context_length")
  let ctxLength: number | undefined
  if (modelInfo.model_info) {
    const info = modelInfo.model_info as Record<string, unknown>
    for (const [key, val] of Object.entries(info)) {
      if (key === 'context_length' || key.endsWith('.context_length')) {
        if (typeof val === 'number' && val > 0) {
          ctxLength = val
          break
        }
      }
    }
  }

  const contextWindow = typeof ctxLength === 'number' && ctxLength > 0 ? ctxLength : DEFAULT_CONTEXT_WINDOW

  // Primary: use top-level capabilities array (modern Ollama versions)
  const caps = modelInfo.capabilities ?? []
  if (caps.length > 0) {
    return {
      contextWindow,
      supportsVision: caps.includes('vision'),
      supportsTools: caps.includes('tools'),
      supportsThinking: caps.includes('thinking'),
    }
  }

  // Fallback: infer from model_info keys (older Ollama versions)
  let hasVision = false
  if (modelInfo.model_info) {
    for (const key of Object.keys(modelInfo.model_info)) {
      if (key.includes('.vision.') || key === 'vision') {
        hasVision = true
        break
      }
    }
  }

  return {
    contextWindow,
    supportsVision: hasVision,
    supportsTools: false,
    supportsThinking: false,
  }
}

// Cache of model capabilities, populated by getOllamaModelInfo + extractContextWindow
const ollamaCapabilitiesCache = new Map<string, OllamaModelCapabilities>()

/**
 * Cache capabilities for a model. Called from createOllamaClient after fetching model info.
 */
export function cacheOllamaModelCapabilities(model: string, caps: OllamaModelCapabilities): void {
  ollamaCapabilitiesCache.set(model, caps)
}

/**
 * Get cached capabilities for an Ollama model (synchronous).
 * Returns null if not yet cached. Call cacheOllamaModelCapabilities() first.
 */
export function getOllamaModelCapabilities(model: string): OllamaModelCapabilities | null {
  return ollamaCapabilitiesCache.get(model) ?? null
}

/**
 * Get the default model for Ollama if none configured.
 * Uses first model from list if available.
 */
export async function getDefaultOllamaModel(): Promise<string> {
  const configured = getOllamaModel()
  if (configured) {
    return configured
  }

  try {
    const models = await listOllamaModels()
    if (models.models.length > 0) {
      return models.models[0].name
    }
  } catch {
    // Ignore errors, fall back to default
  }

  console.warn('[Ollama] No models available from Ollama, using fallback: minimax-m2.7:cloud')
  return 'minimax-m2.7:cloud'
}

/**
 * Get a model or throw if none available.
 * Use this when we cannot proceed without a model.
 */
export function getOllamaModelOrDie(): string {
  const configured = getOllamaModel()
  if (configured) {
    return configured
  }
  throw new Error(
    'No Ollama model configured. Set OLLAMA_MODEL environment variable or ensure Ollama has models available.',
  )
}

/**
 * Get tool capability status and message for a model.
 * Returns whether tools are enabled and an appropriate message if not.
 */
export function getToolCapabilityMessage(modelInfo: OllamaShowModelResponse | null): {
  enabled: boolean
  message: string
} {
  if (modelInfo === null) {
    return {
      enabled: false,
      message: 'Could not determine tool capability',
    }
  }

  const { supportsTools } = extractContextWindow(modelInfo)

  if (supportsTools) {
    return {
      enabled: true,
      message: '',
    }
  }

  return {
    enabled: false,
    message: 'Tools disabled: model does not support tool calling',
  }
}
