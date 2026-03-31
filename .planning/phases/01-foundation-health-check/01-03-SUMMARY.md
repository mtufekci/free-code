---
phase: 01-foundation-health-check
plan: 03
subsystem: api
tags: [ollama, error-handling, connection-errors]

# Dependency graph
requires:
  - phase: 01-foundation-health-check
    provides: Ollama health check, errorUtils with extractConnectionErrorDetails
provides:
  - formatOllamaConnectionError function for Ollama-specific error formatting
affects:
  - src/utils/model/ollama.ts (uses formatOllamaConnectionError)
  - src/services/api/errorUtils.ts (new export)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Error cause chain traversal for error code extraction
    - Actionable error messages with specific guidance per error type

key-files:
  created: []
  modified:
    - src/services/api/errorUtils.ts (added formatOllamaConnectionError)

key-decisions:
  - "Used extractConnectionErrorDetails to extract error codes from cause chain"
  - "Handled ETIMEDOUT, ECONNREFUSED, SSL errors, and fetch failures separately"

patterns-established:
  - "Ollama errors: actionable messages mentioning network/proxy/SSL/Ollama running status"

requirements-completed:
  - ERR-01
  - ERR-02
  - ERR-03

# Metrics
duration: 1 min
completed: 2026-03-31
---

# Phase 1 Plan 3: Ollama Error Formatting Summary

**formatOllamaConnectionError function providing actionable error messages for Ollama connection failures**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-31T22:56:59Z
- **Completed:** 2026-03-31T22:58:02Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- Added formatOllamaConnectionError function to src/services/api/errorUtils.ts
- Function extracts error codes from error cause chain using extractConnectionErrorDetails
- Timeout errors return actionable message mentioning network/proxy settings
- SSL errors return message with OLLAMA_BASE_URL guidance
- Connection refused errors mention Ollama running status
- Fetch failures also handled with actionable messages
- No raw error messages surface to user

## Task Commits

Each task was committed atomically:

1. **task 1: Add formatOllamaConnectionError to errorUtils.ts** - `cd8fce7` (feat)

**Plan metadata:** `None` (docs commit not yet made)

## Files Created/Modified

- `src/services/api/errorUtils.ts` - Added formatOllamaConnectionError function for Ollama-specific error formatting

## Decisions Made

- Used extractConnectionErrorDetails helper already in the codebase to extract error codes
- Prioritized error type handling: ETIMEDOUT → SSL errors → ECONNREFUSED → fetch failures
- For messages without specific codes, used error message content to determine appropriate guidance
- Fallback returns error message only if it's reasonably short and actionable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- formatOllamaConnectionError is ready to be used by Ollama integration code
- Function signature matches plan: formatOllamaConnectionError(error, baseURL)
- Integration point: src/utils/model/ollama.ts via getOllamaBaseURL()

---
*Phase: 01-foundation-health-check*
*Completed: 2026-03-31*

## Self-Check: PASSED

- [x] formatOllamaConnectionError function exists in src/services/api/errorUtils.ts
- [x] Function handles ETIMEDOUT, SSL errors, ECONNREFUSED, and fetch failures
- [x] Commit cd8fce7 verified in git history
