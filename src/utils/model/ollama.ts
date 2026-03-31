import { isEnvTruthy } from '../envUtils.js'

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
