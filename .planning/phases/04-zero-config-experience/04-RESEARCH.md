# Phase 4: Zero-Config Experience - Research

**Researched:** 2026-04-01
**Domain:** Automatic Ollama detection and user suggestion
**Confidence:** HIGH

## Summary

Phase 4 requires implementing automatic detection of Ollama availability and suggesting to users that they enable it. This involves:
1. Detecting if `OLLAMA_BASE_URL` is set (even if `CLAUDE_CODE_USE_OLLAMA` is not)
2. Detecting if the `ollama` CLI is present on the system (via `ollama version` or similar)
3. Showing a startup notification suggesting to enable Ollama when detected

**Primary recommendation:** Add detection logic to `src/utils/model/ollama.ts` using the existing `which` utility and HTTP connectivity check, then wire a new startup notification hook similar to `useOllamaToolCapabilityNotification`.

<user_constraints>
## User Constraints (from REQUIREMENTS.md and ROADMAP.md)

### Requirements
- **PROV-04:** System detects `OLLAMA_BASE_URL` or local Ollama CLI presence and suggests enabling Ollama

### Success Criteria
1. System detects `OLLAMA_BASE_URL` or local Ollama CLI presence and suggests enabling Ollama

### Open Implementation Questions (OpenCode's Discretion)
- Exact notification message wording and format
- Whether detection runs on every startup or is memoized
- How to avoid redundant suggestions if user already declined
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROV-04 | System detects `OLLAMA_BASE_URL` or local Ollama CLI presence and suggests enabling Ollama | Detection functions exist in `ollama.ts`; notification pattern exists via `useStartupNotification` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing codebase | — | TypeScript/Bun | Project standard |
| `which` utility | `src/utils/which.ts` | CLI presence detection | Already exists in codebase |
| `checkOllamaConnection` | `src/utils/model/ollama.ts:36` | HTTP reachability check | Already implemented |
| `useStartupNotification` | `src/hooks/notifs/useStartupNotification.ts` | Startup notification hook | Already exists and used by `useOllamaToolCapabilityNotification` |

### No New Dependencies Required
All detection mechanisms already exist in the codebase.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── utils/model/
│   └── ollama.ts              # Add: detectOllamaAvailability() function
└── hooks/notifs/
    ├── useOllamaToolCapabilityNotification.ts  # Existing pattern
    └── useOllamaDetectionNotification.ts       # NEW: Suggest enabling Ollama
```

### Pattern 1: CLI Detection (already exists)
**What:** Detect if `ollama` command is available on the system
**When to use:** Check for local Ollama CLI installation
```typescript
// src/utils/which.ts already provides this
import { which } from 'src/utils/which.js'

// Usage:
const ollamaPath = await which('ollama')
// Returns path if found, null if not
```

### Pattern 2: Ollama CLI Version Check
**What:** Verify Ollama CLI is not only present but functional
**When to use:** Confirm detected CLI is runnable
```typescript
// Could run `ollama version` to verify CLI works
// Alternative: use `ollama list` which lists available models
```

### Pattern 3: Startup Notification Hook (already exists)
**What:** Show notification at startup when Ollama is detected but not enabled
**When to use:** User has Ollama available but hasn't enabled it
```typescript
// Follow pattern from useOllamaToolCapabilityNotification.ts
export function useOllamaDetectionNotification() {
  useStartupNotification(checkOllamaDetection)
}

async function checkOllamaDetection(): Promise<{
  key: string
  text: string
  color: 'info' | 'warning'
  priority: 'high'
  timeoutMs: number
} | null> {
  // Only if Ollama is NOT already enabled
  if (isOllamaEnabled()) {
    return null
  }

  // Check if OLLAMA_BASE_URL is set
  const hasBaseUrl = Boolean(process.env.OLLAMA_BASE_URL)

  // Check if ollama CLI is available
  const ollamaPath = await which('ollama')
  const hasCli = ollamaPath !== null

  if (!hasBaseUrl && !hasCli) {
    return null // No Ollama detected
  }

  return {
    key: 'ollama-detected-suggest-enable',
    text: hasCli
      ? `Ollama CLI detected. Set CLAUDE_CODE_USE_OLLAMA=true to use it.`
      : `OLLAMA_BASE_URL is set but Ollama is not enabled. Set CLAUDE_CODE_USE_OLLAMA=true to use it.`,
    color: 'info',
    priority: 'high',
    timeoutMs: 15000,
  }
}
```

### Anti-Patterns to Avoid
- **Don't run detection synchronously at import time** — could slow down startup
- **Don't show notification if user already enabled Ollama** — check `isOllamaEnabled()` first
- **Don't detect on every render** — use `useStartupNotification` which runs once per session
- **Don't require Ollama to be running** — just CLI presence is enough for suggestion

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|------------|-----|
| CLI detection | Custom spawn/exec logic | `which('ollama')` from `src/utils/which.ts` | Already exists, handles cross-platform |
| Notification system | Custom console.log/warn | `useStartupNotification` hook | Built for this exact use case |
| Async detection | Blocking sync checks | Async `which()` + `checkOllamaConnection()` | Non-blocking, doesn't slow startup |

**Key insight:** This phase is purely a new combination of existing pieces — CLI detection via `which`, HTTP check via `checkOllamaConnection`, and notification via `useStartupNotification`.

## Common Pitfalls

### Pitfall 1: Running Detection on Every Render
**What goes wrong:** Performance degradation if detection logic runs in a React render path
**Why it happens:** `which()` is async and could be called in a component
**How to avoid:** Only run detection in `useStartupNotification` which is fire-once per session

### Pitfall 2: Conflicting with Existing Ollama Health Check
**What goes wrong:** Duplicate detection/warnings at startup
**Why it happens:** `setup.ts` already runs `checkOllamaConnection` when `isOllamaEnabled()` is true
**How to avoid:** Only suggest enabling when NOT already enabled — the two mechanisms are mutually exclusive

### Pitfall 3: Notification Not Showing
**What goes wrong:** User doesn't see the suggestion
**Why it happens:** `useStartupNotification` doesn't run in --bare mode or remote mode
**How to avoid:** Document that this is UI-only; CLI flag still works regardless

## Code Examples

### Detection Logic (proposed addition to ollama.ts)
```typescript
// In src/utils/model/ollama.ts

export interface OllamaAvailability {
  hasCli: boolean
  hasBaseUrl: boolean
  baseUrl: string
}

/**
 * Detect if Ollama is available on the system but not enabled.
 * Returns availability info without making network requests.
 */
export async function detectOllamaAvailability(): Promise<OllamaAvailability> {
  const baseUrl = getOllamaBaseURL()
  const hasBaseUrl = Boolean(process.env.OLLAMA_BASE_URL)

  // CLI detection - just check if 'ollama' command exists
  const { which } = await import('src/utils/which.js')
  const ollamaPath = await which('ollama')
  const hasCli = ollamaPath !== null

  return {
    hasCli,
    hasBaseUrl,
    baseUrl,
  }
}

/**
 * Check if Ollama should be suggested to the user.
 * Returns true if Ollama is available but not enabled.
 */
export async function shouldSuggestOllama(): Promise<boolean> {
  // Don't suggest if already enabled
  if (isOllamaEnabled()) {
    return false
  }

  const { hasCli, hasBaseUrl } = await detectOllamaAvailability()
  return hasCli || hasBaseUrl
}
```

### Notification Hook (new file)
```typescript
// src/hooks/notifs/useOllamaDetectionNotification.ts
import { isEnvTruthy } from 'src/utils/envUtils.js'
import { detectOllamaAvailability, isOllamaEnabled } from 'src/utils/model/ollama.js'
import { useStartupNotification } from './useStartupNotification.js'

export function useOllamaDetectionNotification() {
  useStartupNotification(checkOllamaDetection)
}

async function checkOllamaDetection(): Promise<{
  key: string
  text: string
  color: 'info' | 'warning'
  priority: 'high'
  timeoutMs: number
} | null> {
  if (isOllamaEnabled()) {
    return null
  }

  const { hasCli, hasBaseUrl, baseUrl } = await detectOllamaAvailability()

  if (!hasCli && !hasBaseUrl) {
    return null
  }

  let text: string
  if (hasCli && hasBaseUrl) {
    text = `Ollama CLI and OLLAMA_BASE_URL detected at ${baseUrl}. Set CLAUDE_CODE_USE_OLLAMA=true to use it.`
  } else if (hasCli) {
    text = `Ollama CLI detected. Set CLAUDE_CODE_USE_OLLAMA=true to use it.`
  } else {
    text = `OLLAMA_BASE_URL is set to ${baseUrl}. Set CLAUDE_CODE_USE_OLLAMA=true to use it.`
  }

  return {
    key: 'ollama-detected-suggest-enable',
    text,
    color: 'info',
    priority: 'high',
    timeoutMs: 15000,
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|-------------|--------|
| No Ollama detection | Detection + suggestion | Phase 4 (this phase) | User awareness improved |

**No prior art to deprecate** — this is a new feature.

## Open Questions

1. **Should we check if Ollama is actually running (HTTP reachability)?**
   - What we know: PROV-04 says "OLLAMA_BASE_URL or local Ollama CLI presence" — doesn't require running
   - What's unclear: Should we ping the URL even without `CLAUDE_CODE_USE_OLLAMA` set?
   - Recommendation: No — just CLI presence or env var presence is enough for suggestion. Let the user decide to enable and then health check will warn if unreachable.

2. **Should the notification include how to set up Ollama?**
   - What we know: Simple "set CLAUDE_CODE_USE_OLLAMA=true" is clear
   - What's unclear: Should we link to docs or explain benefits?
   - Recommendation: Keep it short — this is a suggestion, not a tutorial. User can learn more if interested.

3. **Should detection be memoized across sessions?**
   - What we know: Startup notification fires once per session
   - What's unclear: Should we remember user dismissed the suggestion?
   - Recommendation: No memoization needed — notification has timeout and fires once per session start. If user ignores it, they can enable later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun (project uses bun test) |
| Quick run command | `bun test` |
| Estimated runtime | ~5-10s for new tests |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | File |
|--------|----------|-----------|------|
| PROV-04 | Detection runs when Ollama not enabled | unit | `ollama.test.ts` |
| PROV-04 | Notification shown when CLI detected | unit | `useOllamaDetectionNotification.test.ts` |
| PROV-04 | Notification not shown when already enabled | unit | `useOllamaDetectionNotification.test.ts` |

### Wave 0 Gaps (must be created before implementation)
- `src/utils/model/ollama.test.ts` — add tests for `detectOllamaAvailability`
- `src/hooks/notifs/useOllamaDetectionNotification.test.tsx` — new test file for notification hook

## Sources

### Primary (HIGH confidence)
- `src/utils/which.ts` - Existing CLI detection utility
- `src/utils/model/ollama.ts` - Existing Ollama utilities and `checkOllamaConnection`
- `src/hooks/notifs/useOllamaToolCapabilityNotification.ts` - Template for notification hook
- `src/hooks/notifs/useStartupNotification.ts` - Notification system pattern
- `src/context/notifications.tsx` - Notification type definitions

### Secondary (MEDIUM confidence)
- `src/setup.ts:91-113` - Existing Ollama health check pattern (for comparison)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components already exist in codebase
- Architecture: HIGH - Straightforward composition of existing patterns
- Pitfalls: HIGH - Clear anti-patterns identified

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (simple feature, unlikely to change)
