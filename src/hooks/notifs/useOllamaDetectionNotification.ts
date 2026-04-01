import { useStartupNotification } from './useStartupNotification.js'
import {
  detectOllamaAvailability,
  shouldSuggestOllama,
} from '../../utils/model/ollama.js'

/**
 * Fires a startup notification when Ollama is detected but not enabled.
 * Suggests enabling Ollama for local AI assistance.
 */
export function useOllamaDetectionNotification(): void {
  useStartupNotification(async () => {
    // If already enabled, skip
    if (process.env.CLAUDE_CODE_USE_OLLAMA === 'true') {
      return null
    }

    // Check if we should suggest Ollama
    const shouldSuggest = await shouldSuggestOllama()
    if (!shouldSuggest) {
      return null
    }

    // Get availability details for message
    const availability = await detectOllamaAvailability()

    let message: string
    if (availability.hasCli && availability.hasBaseUrl) {
      message =
        'Ollama CLI and OLLAMA_BASE_URL detected. Enable it for local AI assistance.'
    } else if (availability.hasBaseUrl) {
      message =
        'OLLAMA_BASE_URL detected. Enable it for local AI assistance.'
    } else {
      message = 'Ollama CLI detected. Enable it for local AI assistance.'
    }

    return {
      key: 'ollama-detected-suggest-enable',
      color: 'info' as const,
      priority: 'high' as const,
      timeout: 15000,
      message,
    }
  })
}
