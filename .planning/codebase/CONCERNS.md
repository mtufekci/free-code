# Codebase Concerns

**Analysis Date:** 2026-03-31

## Tech Debt

**TypeScript safety baseline is intentionally loose:**
- Issue: `tsconfig.json` disables important compiler protections with `"strict": false`, `"allowJs": true`, and `"skipLibCheck": true`.
- Files: `tsconfig.json`
- Impact: Type regressions can ship as runtime failures in high-churn areas like `src/main.tsx`, `src/screens/REPL.tsx`, and `src/services/mcp/client.ts`.
- Fix approach: Turn on stricter TypeScript checks incrementally per subsystem, starting with `src/services/mcp/`, `src/utils/sessionStorage.ts`, and `src/utils/hooks.ts`.

**Core runtime logic is concentrated in very large files:**
- Issue: Multiple primary modules are 4.5k-5.6k lines long, including `src/cli/print.ts`, `src/utils/messages.ts`, `src/utils/sessionStorage.ts`, `src/utils/hooks.ts`, `src/screens/REPL.tsx`, and `src/main.tsx`.
- Files: `src/cli/print.ts`, `src/utils/messages.ts`, `src/utils/sessionStorage.ts`, `src/utils/hooks.ts`, `src/screens/REPL.tsx`, `src/main.tsx`
- Impact: Change scope is hard to isolate, reviews are expensive, and bug fixes in one branch of logic can destabilize unrelated flows.
- Fix approach: Split by responsibility boundaries first: transport/auth, message normalization, session persistence, startup bootstrap, and REPL interaction handlers.

**MCP auth and transport code still carries pre-GA TODOs:**
- Issue: The MCP stack still documents unfinished cross-process locking, lockfile token usage, and token-endpoint auth method handling.
- Files: `src/services/mcp/auth.ts`, `src/services/mcp/client.ts`, `src/services/mcp/xaa.ts`
- Impact: Auth refresh, IDE transport, and multi-process behavior remain harder to reason about than the rest of the platform.
- Fix approach: Finish the TODOs before expanding MCP surface area further, then add regression coverage around refresh races and transport selection.

**Telemetry and feature-flag infrastructure remains deeply coupled into runtime code:**
- Issue: The open build stubs event logging in `src/services/analytics/index.ts`, but GrowthBook and analytics-facing imports still appear across startup, session, prompt, and tool flows.
- Files: `src/services/analytics/index.ts`, `src/services/analytics/growthbook.ts`, `src/main.tsx`, `src/utils/sessionStorage.ts`, `src/cli/print.ts`
- Impact: Privacy behavior, startup behavior, and feature-gated behavior are spread across many call sites, increasing maintenance cost and regression risk.
- Fix approach: Introduce a smaller typed runtime-config boundary and migrate callers away from direct analytics/flag service imports.

## Known Bugs

**Cross-process MCP token refresh can race:**
- Symptoms: Two Claude Code processes can perform the same XAA silent refresh concurrently and race on credential storage updates.
- Files: `src/services/mcp/auth.ts`
- Trigger: Run multiple CLI instances against the same expiring MCP OAuth session.
- Workaround: Re-authenticate from one process or avoid parallel sessions against the same MCP auth state.

**IDE SSE transport ignores the lockfile auth token:**
- Symptoms: `sse-ide` connections can fail against IDE servers that expect the lockfile-provided auth token.
- Files: `src/services/mcp/client.ts`
- Trigger: Connect to an authenticated IDE server over the `sse-ide` transport.
- Workaround: Prefer `ws-ide` when available or use an unauthenticated local IDE SSE endpoint.

**Project MCP approval status logic contains a test-coupled workaround:**
- Symptoms: The production code path is intentionally shaped to satisfy an e2e test quirk instead of a clear domain rule.
- Files: `src/services/mcp/utils.ts`
- Trigger: Resolve project MCP server status with partial or unexpected settings state.
- Workaround: Preserve the existing null-safe branch until the e2e expectation is replaced with a real regression test.

## Security Considerations

**Non-macOS credential storage falls back to plaintext:**
- Risk: Secrets can be stored in `~/.claude/.credentials.json` instead of an OS keychain on Linux and other non-darwin environments.
- Files: `src/utils/secureStorage/index.ts`, `src/utils/secureStorage/plainTextStorage.ts`
- Current mitigation: The file is written with mode `0600`, and macOS uses Keychain-first fallback storage.
- Recommendations: Add a Linux secret backend (`libsecret`/Keyring), make plaintext opt-in instead of default, and warn loudly before persisting tokens without OS-backed secret storage.

**Several command execution paths still rely on shell parsing:**
- Risk: Shell-evaluated command strings widen the blast radius of misconfigured or untrusted command sources.
- Files: `src/utils/auth.ts`, `src/utils/hooks.ts`, `src/utils/which.ts`, `src/utils/user.ts`, `src/utils/imagePaste.ts`
- Current mitigation: Some project-sourced auth commands are gated by workspace trust checks in `src/utils/auth.ts`, and Windows bash execution is explicitly constrained in `src/utils/hooks.ts`.
- Recommendations: Prefer argv-based process spawning where possible, narrow trusted command sources, and audit every `shell: true` or `exec(...)` path for user-controlled input.

**The release profile intentionally widens the execution surface:**
- Risk: The build script forces verification off and the repository advertises removal of upstream security-prompt guardrails while enabling many experimental features.
- Files: `scripts/build.ts`, `README.md`
- Current mitigation: No additional hardening layer is added in this fork; safety relies on runtime permissions and model behavior.
- Recommendations: Keep a hardened build profile alongside the permissive one and avoid using the fully unlocked profile as the default production artifact.

## Performance Bottlenecks

**Vertex client auth is recreated instead of reused:**
- Problem: `getAnthropicClient()` constructs a new `GoogleAuth` instance for Vertex requests and documents the lack of caching.
- Files: `src/services/api/client.ts`
- Cause: Auth client lifecycle is not memoized across requests.
- Improvement path: Cache the `GoogleAuth` or resolved auth client by environment/project inputs and invalidate on credential changes.

**Startup still fans out multiple network prefetches:**
- Problem: Startup triggers quota, bootstrap, passes eligibility, and fast-mode prefetches separately.
- Files: `src/main.tsx`
- Cause: Bootstrap work is split into multiple independent calls, and the file already notes they should be consolidated.
- Improvement path: Collapse startup cache-warming into one server round trip and defer non-critical calls until after first render.

**Large hot-path modules increase parse and maintenance cost:**
- Problem: Critical runtime files are extremely large and are loaded in interactive paths.
- Files: `src/cli/print.ts`, `src/utils/messages.ts`, `src/screens/REPL.tsx`, `src/main.tsx`
- Cause: Feature growth accumulated inside a few orchestrator modules instead of narrower components.
- Improvement path: Extract transport adapters, UI command handling, and message transforms into separately loaded modules.

## Fragile Areas

**Session persistence and resume chain logic:**
- Files: `src/utils/sessionStorage.ts`
- Why fragile: The file manages transcript typing, UUID deduplication, sidechain/main-chain routing, remote persistence, and large-file safeguards in one place.
- Safe modification: Change one invariant at a time and verify `/resume`, sidechain agents, `/clear`, and remote persistence together.
- Test coverage: No automated tests were detected for this module.

**MCP transport and auth stack:**
- Files: `src/services/mcp/client.ts`, `src/services/mcp/auth.ts`, `src/services/mcp/xaa.ts`, `src/services/mcp/utils.ts`
- Why fragile: Transport selection, refresh behavior, auth discovery, and per-transport headers are split across several large files with open TODOs.
- Safe modification: Treat `stdio`, `sse`, `sse-ide`, and `ws-ide` as separate test matrices and verify multi-process auth refresh behavior before refactors.
- Test coverage: No automated transport or auth test files were detected in the repository.

**Hooks and task output plumbing:**
- Files: `src/utils/hooks.ts`, `src/utils/task/diskOutput.ts`
- Why fragile: The code mixes shell spawning, async backgrounding, output streaming, flush ordering, and large-output protection.
- Safe modification: Preserve stdin/stdout timing semantics and verify both pipe mode and file-backed mode under cancellation and shutdown.
- Test coverage: No dedicated hook or task-output test suite was detected.

## Scaling Limits

**Session transcripts do not scale cleanly to very large histories:**
- Current capacity: `src/utils/sessionStorage.ts` documents session files reaching multiple GB, while tombstone rewrite fallback caps at 50MB.
- Limit: Large histories require special-case slow paths and still carry OOM avoidance logic.
- Scaling path: Move to segmented transcript storage, background compaction, and indexed lookup instead of whole-file rewrite behavior.

**Task output can consume multi-GB local disk:**
- Current capacity: `src/utils/task/diskOutput.ts` allows up to 5GB per task output file.
- Limit: Long-running or noisy tasks can exhaust disk or make output inspection increasingly expensive.
- Scaling path: Add rotation/compression, lower default caps, and expire old task outputs automatically.

**MCP token refresh only dedupes within one process:**
- Current capacity: `_refreshInProgress` in `src/services/mcp/auth.ts` only coordinates callers inside a single process.
- Limit: Multiple running clients against the same credential set duplicate refresh work and race on storage writes.
- Scaling path: Add the documented cross-process lockfile and centralize refresh ownership.

## Dependencies at Risk

**`@growthbook/growthbook`:**
- Risk: `src/services/analytics/growthbook.ts` already carries API-shape workarounds and is referenced widely across runtime code.
- Impact: Feature gating and startup behavior can break broadly if the remote payload shape or client behavior changes.
- Migration plan: Introduce a local typed feature facade so only one module depends directly on GrowthBook internals.

**`google-auth-library`:**
- Risk: `src/services/api/client.ts` documents repeated auth setup and metadata-discovery edge cases.
- Impact: Vertex startup latency and auth flakiness remain sensitive to environment configuration.
- Migration plan: Wrap auth acquisition in a cached adapter with explicit invalidation semantics.

## Missing Critical Features

**Linux-native secure credential storage:**
- Problem: The secure storage layer explicitly lacks Linux secret-store support and falls back to plaintext persistence.
- Blocks: Safe default deployment on Linux workstations and shared environments.

**Automated test infrastructure:**
- Problem: No test files, test runner config, or test scripts were detected in `package.json` or the repository tree.
- Blocks: Safe refactoring of `src/utils/sessionStorage.ts`, `src/services/mcp/*`, `src/utils/hooks.ts`, and `src/main.tsx`.

## Test Coverage Gaps

**Repository-wide automated testing:**
- What's not tested: No `*.test.*`, `*.spec.*`, Jest/Vitest config, or test scripts were detected.
- Files: `package.json`
- Risk: Regressions are likely to surface only through manual CLI usage.
- Priority: High

**Session persistence and resume flows:**
- What's not tested: Transcript deduplication, sidechain persistence, tombstone rewriting, and large-history resume behavior.
- Files: `src/utils/sessionStorage.ts`
- Risk: Conversation history corruption or incomplete resume behavior can ship unnoticed.
- Priority: High

**MCP auth and IDE transports:**
- What's not tested: XAA discovery, refresh races, `sse-ide` auth behavior, and transport-specific header handling.
- Files: `src/services/mcp/auth.ts`, `src/services/mcp/client.ts`, `src/services/mcp/xaa.ts`, `src/services/mcp/utils.ts`
- Risk: Integration failures will appear only when users connect to real external MCP servers.
- Priority: High

**Shell-driven auth, hooks, and task-output flows:**
- What's not tested: Workspace-trusted auth refresh commands, hook shell execution, and multi-GB task-output lifecycle behavior.
- Files: `src/utils/auth.ts`, `src/utils/hooks.ts`, `src/utils/task/diskOutput.ts`
- Risk: Command execution regressions and race conditions can break user environments or leave failures hard to diagnose.
- Priority: High

---

*Concerns audit: 2026-03-31*
