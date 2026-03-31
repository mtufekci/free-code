# Phase 1: Foundation & Health Check - Research

**Researched:** 2026-03-31
**Domain:** Ollama provider configuration and connectivity validation
**Confidence:** MEDIUM

## Summary

Phase 1 requires adding Ollama as a new API provider alongside existing providers (Bedrock, Vertex, Foundry). The project uses a pattern of `CLAUDE_CODE_USE_*` environment variables to enable providers and configures base URLs per-provider. Health check must be implemented at startup with fail-fast behavior, validating Ollama endpoint reachability without retries. Error handling should follow the existing `formatAPIError` pattern from `errorUtils.ts` for actionable messages.

**Primary recommendation:** Extend the provider pattern in `src/utils/model/providers.ts` with `OLLAMA_BASE_URL` support and implement a lightweight connectivity check in the startup flow (likely in `setup.ts`), using native `fetch` with a short timeout.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Health check timing:** On startup only
- **Health check validation:** Just reachability — simple connection check, don't call /api/version or /api/tags
- **On failure:** Warn and continue, fall back to cloud if available
- **Retry:** No retry — fail fast on startup if Ollama unreachable

### OpenCode's Discretion
- Exact error message wording and formatting
- How to structure the fallback (which provider to prefer when both are configured)
- Configuration validation approach
- Logging verbosity and format

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROV-01 | User can enable Ollama by setting `CLAUDE_CODE_USE_OLLAMA=true` | Provider pattern exists in `providers.ts` using `isEnvTruthy` |
| PROV-02 | User can configure Ollama base URL via `OLLAMA_BASE_URL` env var (defaults to `http://localhost:11434`) | Base URL override pattern exists in client.ts for Bedrock/Foundry |
| PROV-03 | User can configure Ollama model via `OLLAMA_MODEL` env var (defaults to auto-detected) | Model override via env var pattern exists |
| CONN-01 | System performs Ollama health check on startup when enabled | Startup flow in `setup.ts` is the right injection point |
| CONN-02 | System fails fast with clear error if Ollama endpoint is unreachable | Error handling pattern in `errorUtils.ts` provides `formatAPIError` for actionable messages |
| CONN-03 | System validates Ollama API version compatibility on connect | Not required for health check per user decision (just reachability) |
| ERR-01 | Ollama connection errors show actionable messages (not raw API errors) | Extend existing error handling pattern |
| ERR-02 | Ollama timeout and rate-limit errors are handled gracefully | Timeout handling exists in client.ts with `API_TIMEOUT_MS` |
| ERR-03 | System can fall back to cloud provider if Ollama is unavailable (when both are configured) | Provider selection logic in `getAPIProvider()` handles fallback |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.80.0 | Anthropic API client | Existing SDK used for all providers |
| TypeScript | (project default) | Language | Project uses TypeScript throughout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fetch` (built-in) | Node 18+ | HTTP requests for health check | Native fetch for simple connectivity tests |
| `src/utils/envUtils.ts` | N/A | `isEnvTruthy()` helper | Provider enable/disable pattern |

### No New Dependencies Required
Health check can use native `fetch` with AbortController timeout. No additional HTTP client library needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── utils/model/
│   ├── providers.ts      # Extend APIProvider type + getAPIProvider()
│   └── ollama.ts         # NEW: Ollama configuration and health check
├── services/api/
│   └── client.ts         # Extend getAnthropicClient() for Ollama base URL
└── setup.ts              # Add Ollama health check at startup
```

### Pattern 1: Provider Enable Pattern
**What:** Environment variable gates provider selection
**When to use:** User toggles between multiple API providers
**Example:**
```typescript
// src/utils/model/providers.ts
export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'ollama'

export function getAPIProvider(): APIProvider {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_OLLAMA)
    ? 'ollama'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
      ? 'bedrock'
      // ... etc
}
```

### Pattern 2: Base URL Override Pattern
**What:** Provider-specific base URL configuration
**When to use:** Non-Anthropic API providers with custom endpoints
**Example:**
```typescript
// In getAnthropicClient(), already handles:
// - Bedrock: uses AWS SDK (not base URL)
// - Foundry: uses baseURL or ANTHROPIC_FOUNDRY_BASE_URL
// - Vertex: uses region + GoogleAuth
// For Ollama: needs baseURL override via OLLAMA_BASE_URL
```

### Pattern 3: Startup Health Check Pattern
**What:** Connectivity validation at application startup
**When to use:** Ensure dependencies are reachable before use
**Example:**
```typescript
// In setup.ts or early init:
async function validateOllamaConnection(): Promise<HealthCheckResult> {
  const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout
  
  try {
    const response = await fetch(`${baseURL}`, {
      method: 'HEAD',
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return { reachable: response.ok }
  } catch (error) {
    clearTimeout(timeoutId)
    return { reachable: false, error }
  }
}
```

### Anti-Patterns to Avoid
- **Don't use SDK for health check:** Ollama SDK not needed for simple reachability; native fetch is lighter
- **Don't call /api/tags for health check:** User explicitly said just reachability (TCP connect), not API validation
- **Don't retry on failure:** User decision was fail-fast; warn and continue instead

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|------------|-----|
| HTTP client | Custom fetch wrapper | Native `fetch` + AbortController | Simple enough to not need a library |
| Error formatting | Raw error strings | Extend `formatAPIError` | Consistent user-facing messages |
| Provider detection | Custom logic | Extend `getAPIProvider()` | Centralized, tested pattern |

**Key insight:** This is a thin integration layer. Ollama's API is simple (HTTP + JSON). The existing codebase already has patterns for everything needed.

## Common Pitfalls

### Pitfall 1: Blocking Startup on Unreachable Ollama
**What goes wrong:** Health check takes too long and delays CLI startup
**Why it happens:** Default fetch timeout may be too long (60s+)
**How to avoid:** Use explicit 5-second timeout with AbortController
**Warning signs:** CLI hangs on first run if Ollama not running

### Pitfall 2: Conflicting Provider Selection
**What goes wrong:** Multiple providers enabled simultaneously causes unexpected behavior
**Why it happens:** `getAPIProvider()` returns first match, but logic may not enforce mutual exclusivity
**How to avoid:** Ollama is mutually exclusive with cloud providers; document that user should only enable one
**Warning signs:** Requests go to wrong provider

### Pitfall 3: Missing TLS/Proxy Configuration
**What goes wrong:** Health check succeeds but actual requests fail due to corporate proxy
**Why it happens:** Health check uses plain fetch but SDK uses custom proxy handling
**How to avoid:** Use same `getProxyFetchOptions()` pattern from client.ts for actual API calls (Phase 2)

## Code Examples

### Health Check (verified with Ollama API docs)
```typescript
// Source: https://github.com/ollama/ollama/blob/main/docs/api.md
// Health check is just TCP reachability - no API endpoint needed
// Could use GET /api/tags for actual API validation if needed later

async function checkOllamaReachability(
  baseURL: string,
  timeoutMs: number = 5000
): Promise<{ reachable: boolean; error?: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    // Using HEAD request to minimize data transfer
    const response = await fetch(baseURL, {
      method: 'HEAD',
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return { reachable: response.ok || response.status === 404 } // 404 means server is up
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { reachable: false, error: `Connection timed out after ${timeoutMs}ms` }
      }
      return { reachable: false, error: error.message }
    }
    return { reachable: false, error: String(error) }
  }
}
```

### Provider Detection Pattern (from existing code)
```typescript
// Source: src/utils/model/providers.ts
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'ollama'

export function isOllamaEnabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_OLLAMA)
}

export function getOllamaBaseURL(): string {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
}

export function getOllamaModel(): string | undefined {
  return process.env.OLLAMA_MODEL || undefined
}
```

### Error Message Pattern (from existing code)
```typescript
// Source: src/services/api/errorUtils.ts
// Extend for Ollama-specific errors:
export function formatOllamaError(error: unknown): string {
  // Use existing extractConnectionErrorDetails for network errors
  const details = extractConnectionErrorDetails(error)
  if (details) {
    if (details.isSSLError) {
      return `Ollama SSL error (${details.code}). Check your OLLAMA_BASE_URL configuration.`
    }
    if (details.code === 'ETIMEDOUT') {
      return `Ollama connection timed out. Ensure Ollama is running at ${getOllamaBaseURL()}`
    }
  }
  
  if (error instanceof Error) {
    if (error.message.includes('fetch failed')) {
      return `Cannot connect to Ollama at ${getOllamaBaseURL()}. Is Ollama running?`
    }
    return error.message
  }
  return 'Unknown Ollama connection error'
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|-------------|--------|
| Single provider (Anthropic only) | Multi-provider with env var selection | Existing pattern | Ollama just adds another variant |
| Provider-specific SDKs (Bedrock, Vertex, Foundry) | All use @anthropic-ai/sdk with config | Existing | Ollama can follow same pattern |

**Deprecated/outdated:**
- None relevant to this phase

## Open Questions

1. **Should OLLAMA_BASE_URL validation happen at config read time or at health check?**
   - What we know: User wants fail-fast on startup if unreachable
   - What's unclear: Should invalid URL format (e.g., not a valid URL) also fail startup?
   - Recommendation: Yes - invalid URL should warn/fail at startup same as unreachable

2. **How to detect Ollama CLI presence for PROV-04 (deferred to Phase 4)?**
   - What we know: Not needed for Phase 1
   - What's unclear: CLI detection mechanism (spawn `ollama` CLI?)
   - Recommendation: Ignore for now, PROV-04 is Phase 4

3. **Fallback behavior when both Ollama and cloud configured?**
   - What we know: User said "warn and continue, fall back to cloud"
   - What's unclear: What "prefer" means - which is primary?
   - Recommendation: If OLLAMA_USE_CLOUD_FALLBACK=true, use cloud as primary and Ollama as secondary. Otherwise Ollama is primary. OpenCode's discretion per CONTEXT.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun (project uses bun test) |
| Config file | bunfig.toml (if exists) |
| Quick run command | `bun test` (from project root) |
| Full suite command | `bun test` |
| Estimated runtime | ~30-60s (test infrastructure TBD) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-01 | CLAUDE_CODE_USE_OLLAMA=true enables provider | unit | TBD - test isOllamaEnabled() | ❌ Wave 0 gap |
| PROV-02 | OLLAMA_BASE_URL overrides default | unit | TBD - test getOllamaBaseURL() | ❌ Wave 0 gap |
| PROV-03 | OLLAMA_MODEL sets default model | unit | TBD - test getOllamaModel() | ❌ Wave 0 gap |
| CONN-01 | Health check runs on startup | integration | TBD - test startup flow | ❌ Wave 0 gap |
| CONN-02 | Fail fast when unreachable | unit | TBD - test timeout/abort | ❌ Wave 0 gap |
| ERR-01 | Actionable error messages | unit | TBD - test formatOllamaError | ❌ Wave 0 gap |

### Nyquist Sampling Rate
- **Minimum sample interval:** After every committed task → run: `bun test`
- **Full suite trigger:** Before merging final task of any plan wave
- **Phase-complete gate:** Full suite green before `/gsd-verify-work` runs
- **Estimated feedback latency per task:** ~5-10 seconds

### Wave 0 Gaps (must be created before implementation)
- `src/utils/model/providers.test.ts` — covers PROV-01, PROV-02, PROV-03
- `src/utils/model/ollama.test.ts` — covers CONN-01, CONN-02 (health check unit tests)
- `src/services/api/errorUtils.test.ts` — covers ERR-01 (extend existing or create)
- `bunfig.toml` — test configuration if not present

*(No existing test infrastructure found - project appears to use manual testing)*

## Sources

### Primary (HIGH confidence)
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md) - Endpoints, model names, chat format, tool calling
- `src/utils/model/providers.ts` - Existing provider pattern
- `src/services/api/client.ts` - Existing client creation with base URL override
- `src/services/api/errorUtils.ts` - Error handling pattern

### Secondary (MEDIUM confidence)
- [MDN Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) - AbortController timeout pattern
- Project startup flow in `src/setup.ts` - Where to inject health check

### Tertiary (LOW confidence)
- General knowledge of Ollama API compatibility with OpenAI API

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - No existing Ollama integration to reference; patterns are inferred from existing provider code
- Architecture: MEDIUM - Provider pattern is clear, but health check integration point needs verification
- Pitfalls: MEDIUM - Common pitfalls identified based on similar provider integrations

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (Ollama API is stable, provider patterns are established)
