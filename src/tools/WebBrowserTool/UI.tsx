import React from 'react'
import type { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

export function getToolUseSummary(input: {
  [k: string]: unknown
}): string | undefined {
  const action = input.action as string | undefined
  const url = input.url as string | undefined
  if (action === 'navigate' && url) {
    try {
      return `Opening ${new URL(url).hostname}`
    } catch {
      return `Opening ${url}`
    }
  }
  if (action === 'screenshot') return 'Taking screenshot'
  if (action === 'click') return `Clicking "${input.selector ?? 'element'}"`
  if (action === 'fill') return `Filling "${input.selector ?? 'field'}"`
  if (action === 'evaluate') return 'Running JavaScript'
  if (action === 'content') return 'Reading page content'
  if (action === 'wait') return `Waiting for "${input.selector ?? 'element'}"`
  return action ? `Browser: ${action}` : undefined
}

export function renderToolUseMessage(
  _toolUse: ToolUseBlockParam,
  _input: { [k: string]: unknown },
) {
  return null
}

export function renderToolUseProgressMessage(
  _toolUse: ToolUseBlockParam,
  _input: { [k: string]: unknown },
) {
  return null
}

export function renderToolResultMessage(
  _output: { [k: string]: unknown } | null,
) {
  return null
}
