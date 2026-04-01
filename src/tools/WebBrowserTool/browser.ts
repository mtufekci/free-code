/**
 * Headless browser control via Playwright.
 *
 * Runs browser actions by spawning a short-lived Node script that
 * imports the globally-installed playwright package.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

const execFileAsync = promisify(execFile)
const ACTION_TIMEOUT_MS = 45_000

export type BrowserAction = {
  action: 'navigate' | 'screenshot' | 'click' | 'fill' | 'evaluate' | 'content' | 'wait'
  url?: string
  selector?: string
  value?: string
  script?: string
  fullPage?: boolean
  timeout?: number
}

export type BrowserResult = {
  success: boolean
  url?: string
  title?: string
  content?: string
  html?: string
  screenshotPath?: string
  evaluateResult?: string
  error?: string
  durationMs?: number
}

export async function executeBrowserAction(action: BrowserAction): Promise<BrowserResult> {
  const start = Date.now()
  const tmpDir = join(tmpdir(), 'claude-browser')
  mkdirSync(tmpDir, { recursive: true })

  const actionFile = join(tmpDir, `action-${randomUUID()}.json`)
  const scriptFile = join(tmpDir, `run-${randomUUID()}.cjs`)
  const screenshotFile = join(tmpDir, `screenshot-${randomUUID()}.png`)

  writeFileSync(actionFile, JSON.stringify({ ...action, screenshotFile }))
  writeFileSync(scriptFile, RUNNER_SCRIPT)

  try {
    const { stdout, stderr } = await execFileAsync('node', [scriptFile, actionFile], {
      timeout: ACTION_TIMEOUT_MS,
      env: {
        ...process.env,
        NODE_PATH: '/usr/local/lib/node_modules',
      },
    })

    const result = JSON.parse(stdout) as BrowserResult
    result.durationMs = Date.now() - start
    return result
  } catch (e: unknown) {
    const err = e as Error & { stderr?: string; stdout?: string }
    let parsed: BrowserResult | null = null
    if (err.stdout) {
      try { parsed = JSON.parse(err.stdout) } catch { /* ignore */ }
    }
    return parsed ?? {
      success: false,
      error: err.stderr?.slice(0, 500) || err.message || 'Browser action failed',
      durationMs: Date.now() - start,
    }
  } finally {
    try { unlinkSync(actionFile) } catch { /* ignore */ }
    try { unlinkSync(scriptFile) } catch { /* ignore */ }
  }
}

const RUNNER_SCRIPT = `
const { chromium } = require('playwright');
const { readFileSync } = require('fs');

const action = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const result = {};

(async () => {
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  if (action.url && action.action !== 'evaluate') {
    await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  }

  switch (action.action) {
    case 'navigate': {
      result.url = page.url();
      result.title = await page.title();
      const text = await page.innerText('body').catch(() => '');
      result.content = text.slice(0, 50000);
      result.success = true;
      break;
    }

    case 'screenshot': {
      await page.screenshot({ path: action.screenshotFile, fullPage: action.fullPage ?? false });
      result.screenshotPath = action.screenshotFile;
      result.url = page.url();
      result.title = await page.title();
      result.success = true;
      break;
    }

    case 'click': {
      await page.click(action.selector, { timeout: 10000 });
      await page.waitForTimeout(1000);
      result.url = page.url();
      result.title = await page.title();
      const text = await page.innerText('body').catch(() => '');
      result.content = text.slice(0, 50000);
      result.success = true;
      break;
    }

    case 'fill': {
      await page.fill(action.selector, action.value ?? '', { timeout: 10000 });
      result.url = page.url();
      result.success = true;
      break;
    }

    case 'evaluate': {
      if (action.url) {
        await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      }
      const evalResult = await page.evaluate(action.script);
      result.evaluateResult = typeof evalResult === 'string' ? evalResult : JSON.stringify(evalResult);
      result.url = page.url();
      result.success = true;
      break;
    }

    case 'content': {
      result.url = page.url();
      result.title = await page.title();
      result.html = (await page.content()).slice(0, 100000);
      const bodyText = await page.innerText('body').catch(() => '');
      result.content = bodyText.slice(0, 50000);
      result.success = true;
      break;
    }

    case 'wait': {
      await page.waitForSelector(action.selector, { timeout: action.timeout ?? 10000 });
      const text = await page.innerText(action.selector).catch(() => '');
      result.content = text.slice(0, 10000);
      result.url = page.url();
      result.success = true;
      break;
    }
  }
} catch (e) {
  result.success = false;
  result.error = e.message;
} finally {
  if (browser) await browser.close().catch(() => {});
}

process.stdout.write(JSON.stringify(result));
})();
`
