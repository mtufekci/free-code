# Phase 1: Foundation & Health Check - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Provider configuration and connection validation for Ollama integration. User can configure Ollama via environment variables and system validates connectivity on startup before use.

</domain>

<decisions>
## Implementation Decisions

### Health check behavior
- **Timing:** On startup only — not on every request or periodic background
- **Validation:** Just reachability — simple connection check, don't call /api/version or /api/tags
- **On failure:** Warn and continue, fall back to cloud if available
- **Retry:** No retry — fail fast on startup if Ollama unreachable

### OpenCode's Discretion
- Exact error message wording and formatting
- How to structure the fallback (which provider to prefer when both are configured)
- Configuration validation approach
- Logging verbosity and format

</decisions>

<specifics>
## Specific Ideas

No specific references or examples — open to standard approaches for configuration validation and error handling.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-health-check*
*Context gathered: 2026-03-31*
