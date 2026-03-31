# Testing Patterns

**Analysis Date:** 2026-03-31

## Test Framework

**Runner:**
- Bun test (inferred from code references in `src/services/teamMemorySync/watcher.ts`, `src/QueryEngine.ts`, and `src/skills/bundled/remember.ts`)
- Config: Not detected (`vitest.config.*`, `jest.config.*`, and `playwright.config.*` were not found)

**Assertion Library:**
- Bun's built-in test/assertion tooling is implied by repeated `bun test` references and by `spyOn()` testing notes in `src/hooks/useVoiceIntegration.tsx` and `src/constants/prompts.ts`

**Run Commands:**
```bash
bun test              # Inferred default test runner from source comments
Not detected          # Watch mode command not present in `package.json`
Not detected          # Coverage command not present in `package.json`
```

## Test File Organization

**Location:**
- `*.test.*`, `*.spec.*`, and `__tests__/` files were not detected in this snapshot.
- The codebase exposes test seams directly from production modules instead. Examples:
  - `src/services/teamMemorySync/watcher.ts`
  - `src/utils/log.ts`
  - `src/services/analytics/index.ts`
  - `src/utils/settings/changeDetector.ts`
  - `src/utils/skills/skillChangeDetector.ts`

**Naming:**
- Test helpers use explicit names such as `_resetForTesting`, `resetForTesting`, `setSessionFileForTesting`, `_startFileWatcherForTesting`, and `_flushLogWritersForTesting`.
- Examples appear in `src/services/teamMemorySync/watcher.ts`, `src/utils/log.ts`, `src/utils/config.ts`, `src/utils/sessionStorage.ts`, and `src/services/analytics/index.ts`.

**Structure:**
```
src/<module>.ts
└── export reset/injection helpers for tests
    ├── _resetForTesting()
    ├── resetForTesting()
    ├── setXForTesting(...)
    └── _startXForTesting(...)
```

## Test Structure

**Suite Organization:**
```typescript
// `src/query/deps.ts`
export type QueryDeps = {
  callModel: typeof queryModelWithStreaming
  microcompact: typeof microcompactMessages
  autocompact: typeof autoCompactIfNeeded
  uuid: () => string
}

export function productionDeps(): QueryDeps {
  return {
    callModel: queryModelWithStreaming,
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}
```

**Patterns:**
- Prefer dependency injection seams over global monkey-patching when a boundary is well defined, as in `src/query/deps.ts`.
- Reset module state explicitly between tests with exported helpers such as `_resetWatcherStateForTesting()` in `src/services/teamMemorySync/watcher.ts` and `_resetErrorLogForTesting()` in `src/utils/log.ts`.
- Use environment gates for test behavior, especially `process.env.NODE_ENV === 'test'`, in `src/services/vcr.ts`, `src/utils/debug.ts`, `src/setup.ts`, and `src/tools.ts`.

## Mocking

**Framework:** Bun spies plus explicit dependency injection

**Patterns:**
```typescript
// `src/hooks/useVoiceIntegration.tsx`
// Capture the module namespace, not the function: spyOn() mutates the module
// object, so `voiceNs.useVoice(...)` resolves to the spy even if this module
// was loaded before the spy was installed.
const voiceNs = feature('VOICE_MODE')
  ? require('./useVoice.js')
  : { useVoice: () => ({ state: 'idle' as const, handleKeyEvent: () => {} }) }
```

```typescript
// `src/constants/prompts.ts`
// Capture the module (not .isSkillSearchEnabled directly) so spyOn() in tests
// patches what we actually call.
const skillSearchFeatureCheck = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? require('../services/skillSearch/featureCheck.js')
  : null
```

**What to Mock:**
- External boundaries and side effects:
  - model calls and compaction in `src/query/deps.ts`
  - analytics sinks in `src/services/analytics/index.ts`
  - filesystem watcher lifecycle in `src/services/teamMemorySync/watcher.ts`
  - debug and error sinks in `src/utils/log.ts` and `src/utils/debug.ts`

**What NOT to Mock:**
- Prefer real pure logic for normalization, error classification, and mapping helpers in modules such as `src/utils/errors.ts`, `src/state/store.ts`, and `src/utils/toolResultStorage.ts`.
- Prefer real serialized fixtures over ad-hoc mocked API payloads when exercising message and API flows; `src/services/vcr.ts` exists specifically for this path.

## Fixtures and Factories

**Test Data:**
```typescript
// `src/services/vcr.ts`
const filename = join(
  process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT ?? getCwd(),
  `fixtures/${fixtureName}-${hash}.json`,
)

if ((env.isCI || process.env.CI) && !isEnvTruthy(process.env.VCR_RECORD)) {
  throw new Error(
    `Fixture missing: ${filename}. Re-run tests with VCR_RECORD=1, then commit the result.`,
  )
}
```

**Location:**
- Fixtures are stored under `fixtures/` relative to the working directory, or under the directory pointed to `CLAUDE_CODE_TEST_FIXTURES_ROOT`, as defined in `src/services/vcr.ts`.
- Fixture filenames are deterministic hashes of dehydrated inputs in `src/services/vcr.ts`.

## Coverage

**Requirements:** None enforced in the visible snapshot

**View Coverage:**
```bash
Not detected
```

- A `/coverage/` directory is treated as generated output by `src/utils/generatedFiles.ts`, which implies coverage artifacts may exist in other environments even though no coverage command is present in `package.json`.

## Test Types

**Unit Tests:**
- Unit-style testing is the dominant inferred pattern.
- Production modules expose resettable internal state and injectable dependencies so tests can exercise logic in isolation without booting the full CLI. Examples: `src/query/deps.ts`, `src/services/teamMemorySync/watcher.ts`, `src/utils/log.ts`, and `src/services/analytics/index.ts`.

**Integration Tests:**
- Integration-style testing is supported through real filesystem and API-adjacent seams.
- `src/services/teamMemorySync/watcher.ts` exposes `_startFileWatcherForTesting()` for real watcher behavior.
- `src/services/vcr.ts` records and replays real API-shaped payloads through hashed fixtures.

**E2E Tests:**
- Not detected

## Common Patterns

**Async Testing:**
```typescript
// `src/services/teamMemorySync/watcher.ts`
export function _startFileWatcherForTesting(dir: string): Promise<void> {
  return startFileWatcher(dir)
}
```

- Async seams return real `Promise` values and keep the production implementation intact.
- Use reset helpers before awaiting async work, as suggested by `_resetWatcherStateForTesting()` and other `resetForTesting()` exports across `src/services/*` and `src/utils/*`.

**Error Testing:**
```typescript
// `src/services/vcr.ts`
if (env.isCI && !isEnvTruthy(process.env.VCR_RECORD)) {
  throw new Error(
    `Anthropic API fixture missing: ${filename}. Re-run tests with VCR_RECORD=1, then commit the result.`,
  )
}
```

- Error paths are expected to be deterministic and string-stable enough for assertion.
- Error normalization helpers in `src/utils/errors.ts` (`toError`, `errorMessage`, `getErrnoCode`) are the expected building blocks around thrown or caught failures.

---

*Testing analysis: 2026-03-31*
