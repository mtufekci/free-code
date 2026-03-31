# Coding Conventions

**Analysis Date:** 2026-03-31

## Naming Patterns

**Files:**
- Use `camelCase` for most hand-written modules, especially utilities, services, and hooks such as `src/utils/toolResultStorage.ts`, `src/utils/errors.ts`, `src/services/internalLogging.ts`, and `src/hooks/useVoiceIntegration.tsx`.
- Use `PascalCase` for React/stateful modules and class-oriented modules such as `src/state/AppState.tsx`, `src/state/AppStateStore.ts`, and `src/services/plugins/PluginInstallationManager.ts`.
- Keep `.tsx` for React-rendering files such as `src/context/notifications.tsx` and `src/entrypoints/cli.tsx`; keep `.ts` for non-UI logic such as `src/query/deps.ts` and `src/state/store.ts`.

**Functions:**
- Use `camelCase` verbs for functions and helpers: `createStore` in `src/state/store.ts`, `getPersistenceThreshold` in `src/utils/toolResultStorage.ts`, `logPermissionContextForAnts` in `src/services/internalLogging.ts`, and `productionDeps` in `src/query/deps.ts`.
- Prefix React hooks with `use`, matching `useNotifications` in `src/context/notifications.tsx`, `useAppState` in `src/state/AppState.tsx`, and `useVoiceIntegration` in `src/hooks/useVoiceIntegration.tsx`.
- Prefix boolean helpers with `is`, `has`, `can`, or `should`, matching `isAbortError` in `src/utils/errors.ts`, `isDebugMode` in `src/utils/debug.ts`, and `shouldUseVCR` in `src/services/vcr.ts`.

**Variables:**
- Use `UPPER_SNAKE_CASE` for constants such as `DEFAULT_TIMEOUT_MS` in `src/context/notifications.tsx`, `PERSIST_THRESHOLD_OVERRIDE_FLAG` in `src/utils/toolResultStorage.ts`, and `DEBOUNCE_MS` in `src/services/teamMemorySync/watcher.ts`.
- Use descriptive local state names such as `hasPendingChanges`, `pushSuppressedReason`, `currentTimeoutId`, and `mutableMessages` in `src/services/teamMemorySync/watcher.ts`, `src/context/notifications.tsx`, and `src/QueryEngine.ts`.
- Use long explicit names when a value has safety requirements, for example `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` in `src/services/analytics/index.ts` and `src/services/internalLogging.ts`.

**Types:**
- Use `PascalCase` for types and interfaces such as `QueryEngineConfig` in `src/QueryEngine.ts`, `PersistedToolResult` in `src/utils/toolResultStorage.ts`, and `Store<T>` in `src/state/store.ts`.
- Suffix schemas with `Schema`, results with `Result`, configs with `Config`, and state containers with `State`, matching `SettingsSchema` in `src/utils/settings/types.ts`, `PersistToolResultError` in `src/utils/toolResultStorage.ts`, and `SyncState` in `src/services/teamMemorySync/watcher.ts`.
- Use string-literal unions for constrained values, such as `Priority = 'low' | 'medium' | 'high' | 'immediate'` in `src/context/notifications.tsx`.

## Code Style

**Formatting:**
- Config file not detected in the snapshot: no `eslint.config.*`, `.eslintrc*`, `biome.json`, or Prettier config file was found at the repo root.
- Follow the surrounding file style instead of forcing one global style. Most hand-written `.ts` files use:
  - single quotes, as in `src/QueryEngine.ts` and `src/utils/errors.ts`
  - no semicolons, as in `src/state/store.ts`, `src/query/deps.ts`, and `src/services/vcr.ts`
  - multiline imports when lists are long, as in `src/main.tsx` and `src/QueryEngine.ts`
  - trailing commas in multiline objects/params, as in `src/utils/errors.ts` and `src/services/teamMemorySync/watcher.ts`
- Some files are generated or compiler-transformed and keep different formatting, such as `src/state/AppState.tsx`; do not normalize generated output by hand.

**Linting:**
- Lint config file not detected in the snapshot, but inline suppressions show active ESLint and Biome usage across the codebase.
- Use narrow, local suppressions with a reason when breaking a rule. Examples:
  - `// eslint-disable-next-line custom-rules/no-top-level-side-effects` in `src/main.tsx`
  - `/* eslint-disable @typescript-eslint/no-require-imports */` around feature-gated requires in `src/hooks/useVoiceIntegration.tsx`
  - `// biome-ignore lint/suspicious/noConsole: intentional console output` in `src/utils/worktree.ts`
- Keep suppression comments explanatory. The existing pattern is to justify the exception inline rather than disable a rule globally.

## Import Organization

**Order:**
1. Platform and third-party imports first, such as `bun:bundle`, `crypto`, `fs/promises`, React, lodash, and SDK packages in `src/main.tsx`, `src/QueryEngine.ts`, and `src/services/vcr.ts`.
2. Aliased project imports using `src/*` next when the file reaches across the codebase, such as `src/services/analytics/index.js` and `src/bootstrap/state.js` in `src/main.tsx` and `src/utils/debug.ts`.
3. Relative local imports last for nearby modules, such as `./debug.js`, `../types/message.js`, and `./index.js` in `src/utils/toolResultStorage.ts`, `src/services/vcr.ts`, and `src/services/teamMemorySync/watcher.ts`.

**Path Aliases:**
- Use the `src/*` alias defined in `tsconfig.json` when it improves clarity for non-local imports.
- Relative imports remain common for same-folder and nearby files, especially in `src/utils/*`, `src/services/*`, and `src/state/*`.
- Internal imports consistently include the `.js` extension, even in TypeScript source, as shown throughout `src/QueryEngine.ts`, `src/main.tsx`, and `src/state/AppState.tsx`.
- Use `import type` or inline `type` imports for type-only references, as seen in `src/QueryEngine.ts`, `src/services/internalLogging.ts`, and `src/utils/settings/types.ts`.

## Error Handling

**Patterns:**
- Catch `unknown` and normalize with helpers from `src/utils/errors.ts`, especially `toError`, `errorMessage`, `getErrnoCode`, and `isENOENT`.
- Prefer dedicated error classes when an error carries structured meaning, such as `AbortError`, `ConfigParseError`, `ShellError`, and `TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` in `src/utils/errors.ts`.
- Use short early-return guards instead of deep nesting, as in `src/state/store.ts`, `src/services/internalLogging.ts`, and `src/services/teamMemorySync/watcher.ts`.
- Treat expected filesystem races as non-fatal. Examples:
  - `ensureToolResultsDir()` ignores mkdir collisions in `src/utils/toolResultStorage.ts`
  - `getKubernetesNamespace()` and `getContainerId()` fall back to sentinel strings in `src/services/internalLogging.ts`
  - `logError()` swallows secondary logging failures in `src/utils/log.ts`
- Convert operational failures into stable messages at the boundary. `src/utils/toolResultStorage.ts` returns `{ error: string }` for persistence failures instead of throwing through the caller.

## Logging

**Framework:** `logForDebugging`, `logError`, and `logEvent`

**Patterns:**
- Use `logForDebugging()` from `src/utils/debug.ts` for diagnostic traces, optionally with a structured level, as in `src/services/teamMemorySync/watcher.ts`.
- Use `logError()` from `src/utils/log.ts` for caught exceptions that should reach debug, in-memory, and sink-backed error channels.
- Use `logEvent()` through the analytics boundary in `src/services/analytics/index.ts` and `src/services/internalLogging.ts` when an event name and sanitized metadata are needed.
- Reserve direct `console.*` usage for intentional user-facing or crash output, and annotate it with lint suppressions, as seen in `src/entrypoints/cli.tsx`, `src/utils/log.ts`, and `src/utils/worktree.ts`.

## Comments

**When to Comment:**
- Comment the why, invariants, and edge cases, not the obvious control flow.
- Use file-header and block comments to document runtime constraints and performance decisions, as in `src/main.tsx`, `src/query/deps.ts`, `src/services/teamMemorySync/watcher.ts`, and `src/services/vcr.ts`.
- Keep migration and compatibility notes adjacent to the code they constrain, as in `src/state/AppState.tsx` and `src/utils/settings/types.ts`.
- Document test-specific seams inline when they affect production structure, as in `src/hooks/useVoiceIntegration.tsx`, `src/constants/prompts.ts`, and `src/services/teamMemorySync/watcher.ts`.

**JSDoc/TSDoc:**
- JSDoc-style comments are used heavily on exported functions, types, and modules in `src/utils/errors.ts`, `src/utils/toolResultStorage.ts`, `src/services/internalLogging.ts`, and `src/QueryEngine.ts`.
- Keep doc comments pragmatic: explain the contract, runtime assumptions, and edge conditions.

## Function Design

**Size:**
- Small helpers stay compact and single-purpose, such as `createStore()` in `src/state/store.ts` and `productionDeps()` in `src/query/deps.ts`.
- Large orchestration files are accepted when they centralize lifecycle logic, such as `src/main.tsx` and `src/QueryEngine.ts`; in these files, split behavior into focused helpers and strongly typed config objects.

**Parameters:**
- Prefer typed object parameters when a function takes multiple related values, as in `createStore(initialState, onChange)` in `src/state/store.ts` and the options objects in `src/services/teamMemorySync/watcher.ts` and `src/context/notifications.tsx`.
- Use generic parameterization for reusable primitives, as in `Store<T>` and `createStore<T>` in `src/state/store.ts`.
- Use updater callbacks for mutable state transitions, matching `setState((prev) => next)` patterns in `src/state/store.ts` and `src/context/notifications.tsx`.

**Return Values:**
- Prefer explicit unions or typed result objects over loosely shaped data, as in `PersistedToolResult | PersistToolResultError` in `src/utils/toolResultStorage.ts` and the classified results in `src/utils/errors.ts`.
- Return early with sentinel values when absence is expected, such as `null`, `undefined`, or unchanged `prev` state in `src/services/internalLogging.ts`, `src/state/store.ts`, and `src/context/notifications.tsx`.

## Module Design

**Exports:**
- Prefer named exports for application logic, helpers, and types. This is the dominant pattern in `src/state/store.ts`, `src/utils/errors.ts`, `src/query/deps.ts`, and `src/services/internalLogging.ts`.
- Default exports appear mainly in lower-level UI or compatibility layers such as `src/ink/components/*.tsx`, `src/ink/*.ts`, and a few utility modules surfaced by `src/ink.ts`.

**Barrel Files:**
- Barrel usage is limited and intentional. Existing boundaries include `src/ink.ts` and the back-compat re-exports in `src/state/AppState.tsx`.
- Add new re-exports only when the module is a stable boundary; otherwise import the concrete file directly.

---

*Convention analysis: 2026-03-31*
