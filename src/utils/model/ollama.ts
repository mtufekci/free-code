import { isEnvTruthy } from '../envUtils.js'
import type {
  OllamaListModelsResponse,
  OllamaShowModelResponse,
  OllamaModelContextWindow,
} from '../../types/ollama.js'

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
  error?: string
}> {
  const baseURL = getOllamaBaseURL()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    await fetch(baseURL, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timeout)
    return { reachable: true }
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { reachable: false, error: 'timeout' }
      }
      return { reachable: false, error: error.message }
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
 */
export async function listOllamaModels(): Promise<OllamaListModelsResponse> {
  const baseURL = getOllamaBaseURL()
  const response = await fetch(`${baseURL}/api/tags`)

  if (!response.ok) {
    throw new Error(`Failed to list Ollama models: ${response.statusText}`)
  }

  return response.json() as Promise<OllamaListModelsResponse>
}

/**
 * Get detailed information about a specific Ollama model.
 * Includes context window size and capabilities.
 */
export async function getOllamaModelInfo(modelName: string): Promise<OllamaShowModelResponse> {
  const baseURL = getOllamaBaseURL()
  const response = await fetch(`${baseURL}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName }),
  })

  if (!response.ok) {
    throw new Error(`Failed to get model info: ${response.statusText}`)
  }

  return response.json() as Promise<OllamaShowModelResponse>
}

/**
 * Extract context window size from model info.
 * Falls back to default if not determinable.
 */
export function extractContextWindow(modelInfo: OllamaShowModelResponse): OllamaModelContextWindow {
  // Context window may be stored in model_info.ctx_length or similar field
  const ctxLength = modelInfo.model_info?.context_length ??
                    modelInfo.model_info?.['context_length'] ??
                    4096 // Ollama default
  const contextWindow = typeof ctxLength === 'number' ? ctxLength : 4096

  // Check for vision capability
  const supportsVision = Boolean(
    modelInfo.model_info?.vision ?? false
  )

  // Check for tool capability (future Phase 3)
  const supportsTools = Boolean(
    modelInfo.model_info?.tools ?? false
  )

  return {
    contextWindow,
    supportsVision,
    supportsTools,
  }
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

  return 'minimax-m2.7:cloud'
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
