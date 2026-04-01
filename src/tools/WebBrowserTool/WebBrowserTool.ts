import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { DESCRIPTION, WEB_BROWSER_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'
import { executeBrowserAction, type BrowserResult } from './browser.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['navigate', 'screenshot', 'click', 'fill', 'evaluate', 'content', 'wait'])
      .describe('The browser action to perform'),
    url: z.string().optional()
      .describe('URL to navigate to (required for "navigate", optional for others if page already loaded)'),
    selector: z.string().optional()
      .describe('CSS selector for click, fill, or wait actions'),
    value: z.string().optional()
      .describe('Value to fill into the selected element (for "fill" action)'),
    script: z.string().optional()
      .describe('JavaScript to evaluate in the browser (for "evaluate" action)'),
    fullPage: z.boolean().optional()
      .describe('Whether to capture full page screenshot (for "screenshot" action)'),
    timeout: z.number().optional()
      .describe('Timeout in milliseconds for wait actions'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    url: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    html: z.string().optional(),
    screenshotPath: z.string().optional(),
    evaluateResult: z.string().optional(),
    error: z.string().optional(),
    durationMs: z.number().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const WebBrowserTool = buildTool({
  name: WEB_BROWSER_TOOL_NAME,
  searchHint: 'browser navigate click screenshot interact web page',
  maxResultSizeChars: 60_000,
  shouldDefer: false,

  async prompt() {
    return DESCRIPTION
  },

  async description(input) {
    const { action, url } = input as Input
    if (action === 'navigate' && url) {
      try {
        return `Navigate to ${new URL(url).hostname}`
      } catch {
        return `Navigate to ${url}`
      }
    }
    const labels: Record<string, string> = {
      screenshot: 'Take a browser screenshot',
      click: 'Click an element on the page',
      fill: 'Fill a form field',
      evaluate: 'Run JavaScript in the browser',
      content: 'Read the page content',
      wait: 'Wait for an element',
    }
    return labels[action] ?? 'Perform a browser action'
  },

  userFacingName() {
    return 'WebBrowser'
  },

  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ?? 'Browser action'
  },

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  get outputSchema(): OutputSchema {
    return outputSchema()
  },

  isConcurrencySafe() {
    return false
  },

  isReadOnly() {
    return true
  },

  needsPermissions() {
    return true
  },

  async call(input) {
    const { action, url, selector, value, script, fullPage, timeout } = input as Input

    if (action === 'navigate' && !url) {
      return { data: { success: false, error: 'URL is required for navigate action' } as unknown as Output }
    }

    if ((action === 'click' || action === 'fill' || action === 'wait') && !selector) {
      return { data: { success: false, error: `Selector is required for ${action} action` } as unknown as Output }
    }

    if (action === 'evaluate' && !script) {
      return { data: { success: false, error: 'Script is required for evaluate action' } as unknown as Output }
    }

    const result: BrowserResult = await executeBrowserAction({
      action,
      url,
      selector,
      value,
      script,
      fullPage,
      timeout,
    })

    const output: Output = {
      ...result,
      ...(result.screenshotPath ? { content: `Screenshot saved to ${result.screenshotPath}` } : {}),
    } as Output

    return { data: output }
  },

  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: JSON.stringify(content),
    }
  },

  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, Output>)
