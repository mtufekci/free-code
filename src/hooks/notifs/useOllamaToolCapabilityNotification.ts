import { isEnvTruthy } from 'src/utils/envUtils.js'
import {
  getOllamaModel,
  getOllamaModelInfo,
  getToolCapabilityMessage,
} from 'src/utils/model/ollama.js'
import { useStartupNotification } from './useStartupNotification.js'

/**
 * Shows a startup notification when Ollama model doesn't support tool calling.
 * Users should see this warning when they start a session with an unsupported model.
 */
export function useOllamaToolCapabilityNotification() {
  useStartupNotification(checkToolCapability)
}

async function checkToolCapability(): Promise<{
  key: string
  text: string
  color: 'warning'
  priority: 'high'
  timeoutMs: number
} | null> {
  // Only check if Ollama is enabled
  if (!isEnvTruthy(process.env.CLAUDE_CODE_USE_OLLAMA)) {
    return null
  }

  const modelName = getOllamaModel()

  // Try to get model info to check tool capability
  let modelInfo = null
  try {
    modelInfo = await getOllamaModelInfo(modelName)
  } catch {
    // If we can't get model info, don't show warning
    return null
  }

  const { enabled, message } = getToolCapabilityMessage(modelInfo)

  if (enabled) {
    // Tools are enabled, no warning needed
    return null
  }

  return {
    key: 'ollama-tools-disabled',
    text: message,
    color: 'warning',
    priority: 'high',
    timeoutMs: 15000,
  }
}
