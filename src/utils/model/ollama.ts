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
 * Returns undefined if not configured (caller should handle default model).
 */
export function getOllamaModel(): string | undefined {
  return process.env.OLLAMA_MODEL
}
