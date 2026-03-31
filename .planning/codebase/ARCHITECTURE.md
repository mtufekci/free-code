# Architecture

**Analysis Date:** 2026-03-31

## Pattern Overview

**Overall:** Feature-rich CLI application with centralized registries, a shared query engine, and layered runtime services.

**Key Characteristics:**
- Startup is funneled through `src/entrypoints/cli.tsx` into `src/main.tsx`, with specialized fast paths for bridge, daemon, background, and utility entrypoints.
- Interactive and headless execution share the same core model/tool pipeline through `src/query.ts`, `src/QueryEngine.ts`, `src/Tool.ts`, and `src/tools.ts`.
- UI state is split between bootstrap process state in `src/bootstrap/state.ts` and React store state in `src/state/AppStateStore.ts` / `src/state/AppState.tsx`.

## Layers

**Entrypoint layer:**
- Purpose: Select the runtime mode and bootstrap the process.
- Location: `src/entrypoints/`, primarily `src/entrypoints/cli.tsx`, `src/entrypoints/init.ts`, and `src/main.tsx`.
- Contains: CLI fast paths, environment setup, initialization, Commander wiring, mode detection, and top-level process lifecycle.
- Depends on: `src/utils/`, `src/services/`, `src/bootstrap/state.ts`, `src/commands.ts`, `src/tools.ts`, and `src/screens/REPL.tsx`.
- Used by: All runtime modes, including the main CLI, bridge mode, daemon mode, SDK/headless mode, and remote session flows.

**Registry layer:**
- Purpose: Assemble the command, tool, skill, and agent catalogs before a session runs.
- Location: `src/commands.ts`, `src/tools.ts`, `src/skills/loadSkillsDir.ts`, and `src/tools/AgentTool/loadAgentsDir.ts`.
- Contains: Built-in command registration, tool pool construction, dynamic skill discovery, plugin/MCP merging, and agent definition loading.
- Depends on: `src/commands/`, `src/tools/`, `src/skills/`, `src/utils/plugins/`, `src/services/mcp/`, and `src/utils/markdownConfigLoader.ts`.
- Used by: `src/main.tsx`, `src/setup.ts`, `src/screens/REPL.tsx`, and `src/QueryEngine.ts`.

**Session state layer:**
- Purpose: Hold global process state and interactive session state.
- Location: `src/bootstrap/state.ts`, `src/state/AppStateStore.ts`, `src/state/AppState.tsx`, and `src/state/store.ts`.
- Contains: Session IDs, cwd/project-root tracking, telemetry counters, prompt-cache latches, REPL app state, tasks, MCP/plugin state, and React store primitives.
- Depends on: Low-level types and utilities such as `src/types/ids.ts`, `src/utils/settings/`, and `src/utils/commitAttribution.ts`.
- Used by: `src/main.tsx`, `src/setup.ts`, `src/screens/REPL.tsx`, `src/QueryEngine.ts`, and most hooks/services.

**Interaction/UI layer:**
- Purpose: Render the terminal UI and coordinate user interaction.
- Location: `src/screens/REPL.tsx`, `src/components/`, `src/hooks/`, `src/context/`, and `src/ink/`.
- Contains: The main REPL screen, dialogs, message rendering, permission prompts, transcript view, task panels, and React hooks that bind UI to runtime state.
- Depends on: `src/state/`, `src/query.ts`, `src/tools.ts`, `src/commands.ts`, `src/services/`, and `src/utils/`.
- Used by: Interactive CLI sessions launched from `src/main.tsx`.

**Query orchestration layer:**
- Purpose: Execute a turn against the model, recover from failures, and run tools.
- Location: `src/query.ts`, `src/query/config.ts`, `src/query/deps.ts`, `src/query/stopHooks.ts`, and `src/QueryEngine.ts`.
- Contains: Query loop state machine, compaction/retry logic, tool follow-up flow, stop-hook handling, and the reusable headless conversation engine.
- Depends on: `src/services/api/claude.ts`, `src/services/tools/toolOrchestration.ts`, `src/services/compact/`, `src/utils/messages.ts`, and `src/Tool.ts`.
- Used by: `src/screens/REPL.tsx` for interactive sessions and `src/QueryEngine.ts` for SDK/headless sessions.

**Tool execution layer:**
- Purpose: Define tool contracts and execute tool calls with permission checks and progress streaming.
- Location: `src/Tool.ts`, `src/tools/`, `src/services/tools/toolOrchestration.ts`, and `src/services/tools/toolExecution.ts`.
- Contains: The canonical `Tool` interface, base tool assembly, concurrency partitioning, individual tool implementations, and tool orchestration helpers.
- Depends on: `src/hooks/useCanUseTool.tsx`, `src/types/`, `src/utils/permissions/`, and tool-specific service modules.
- Used by: `src/query.ts`, `src/QueryEngine.ts`, `src/screens/REPL.tsx`, and any agent/subagent execution path.

**Integration/service layer:**
- Purpose: Wrap external systems and cross-cutting product features.
- Location: `src/services/` and focused domains like `src/remote/` and `src/bridge/`.
- Contains: API clients in `src/services/api/`, MCP connectivity in `src/services/mcp/`, analytics in `src/services/analytics/`, LSP support in `src/services/lsp/`, remote-session management in `src/remote/RemoteSessionManager.ts`, and bridge orchestration in `src/bridge/bridgeMain.ts`.
- Depends on: SDK packages, transport adapters, `src/utils/`, and bootstrap/session state.
- Used by: Entry points, query execution, UI hooks, and background task flows.

## Data Flow

**Interactive CLI turn:**

1. `src/entrypoints/cli.tsx` chooses the standard CLI path and imports `src/main.tsx`.
2. `src/main.tsx` runs initialization through `src/entrypoints/init.ts`, loads commands from `src/commands.ts`, loads tools from `src/tools.ts`, and renders `src/screens/REPL.tsx`.
3. `src/screens/REPL.tsx` merges built-in, plugin, and MCP commands/tools via hooks such as `src/hooks/useMergedCommands.ts` and `src/hooks/useMergedTools.ts`, then submits prompts into `src/query.ts`.
4. `src/query.ts` normalizes messages, compacts context, calls the model through `src/services/api/claude.ts`, executes tool calls through `src/services/tools/toolOrchestration.ts`, and yields new messages/progress back into the REPL.

**Headless / SDK turn:**

1. `src/main.tsx` detects non-interactive execution and initializes the same command/tool catalogs.
2. `src/QueryEngine.ts` builds the system prompt, processes slash-command-like input transformations, and delegates the turn loop to `src/query.ts`.
3. `src/query.ts` streams assistant, tool, attachment, and result events.
4. `src/QueryEngine.ts` persists transcript state and re-emits SDK-shaped messages.

**Remote / bridge session flow:**

1. `src/entrypoints/cli.tsx` routes bridge invocations into `src/bridge/bridgeMain.ts` and remote session viewers into `src/main.tsx` / `src/remote/RemoteSessionManager.ts`.
2. `src/bridge/bridgeMain.ts` polls remote work, spawns local child sessions, and keeps those sessions alive with heartbeat and reconnect logic.
3. `src/remote/RemoteSessionManager.ts` translates WebSocket and control traffic into SDK messages and permission callbacks for the UI.
4. `src/screens/REPL.tsx` uses remote hooks such as `src/hooks/useRemoteSession.ts` and `src/hooks/useReplBridge.tsx` to display and control the session.

**State Management:**
- Use `src/bootstrap/state.ts` for process-scoped state that must survive outside React, such as session identity, cwd/project-root, telemetry counters, and feature latches.
- Use `src/state/AppStateStore.ts` with `src/state/AppState.tsx` for interactive UI/session state that drives rendering, prompts, tasks, MCP state, notifications, and REPL behavior.
- Use hook-level memoized mergers like `src/hooks/useMergedCommands.ts` and `src/hooks/useMergedTools.ts` to derive final runtime collections from the store and registries.

## Key Abstractions

**Command abstraction:**
- Purpose: Represent slash commands, skills, and local/JSX command handlers with one shape.
- Examples: `src/commands.ts`, `src/types/command.ts`, `src/commands/plan/index.ts`, `src/commands/mcp/index.ts`.
- Pattern: Command objects are registered centrally and then filtered/merged by availability, plugins, skills, and remote-safety rules.

**Tool abstraction:**
- Purpose: Represent model-callable tools with a strict schema, UI renderers, permission checks, and execution semantics.
- Examples: `src/Tool.ts`, `src/tools/BashTool/BashTool.ts`, `src/tools/FileReadTool/FileReadTool.ts`, `src/tools/AgentTool/AgentTool.ts`.
- Pattern: Define tools in feature folders under `src/tools/`, export them through `src/tools.ts`, and execute them through `src/services/tools/toolOrchestration.ts`.

**Query engine abstraction:**
- Purpose: Keep turn execution reusable across interactive and non-interactive environments.
- Examples: `src/query.ts`, `src/QueryEngine.ts`, `src/query/config.ts`, `src/query/stopHooks.ts`.
- Pattern: `src/query.ts` owns the low-level generator loop; `src/QueryEngine.ts` wraps that loop with SDK/headless state and transcript behavior.

**Skill abstraction:**
- Purpose: Treat Markdown-defined capabilities as first-class prompt commands.
- Examples: `src/skills/loadSkillsDir.ts`, `src/skills/bundledSkills.ts`, `src/skills/bundled/`, `src/commands.ts`.
- Pattern: Load skills from configured directories, convert them to prompt commands, and merge them into the command registry alongside built-ins and plugins.

**Task abstraction:**
- Purpose: Track asynchronous/background work across shell tasks, agents, workflows, remote agents, and teammate tasks.
- Examples: `src/Task.ts`, `src/tasks/types.ts`, `src/tasks/LocalAgentTask/`, `src/tasks/RemoteAgentTask/`, `src/components/TaskListV2.tsx`.
- Pattern: Create typed task-state records, store them in `AppState.tasks`, and render them through shared task UI and navigation hooks.

## Entry Points

**CLI bootstrap:**
- Location: `src/entrypoints/cli.tsx`
- Triggers: Running the `claude` / `claude-source` binary from `package.json`.
- Responsibilities: Handle fast-path flags, choose special runtime modes, set environment guards, and import `src/main.tsx` only when the full CLI is needed.

**Main runtime:**
- Location: `src/main.tsx`
- Triggers: Standard CLI execution after bootstrap.
- Responsibilities: Parse arguments, initialize settings/trust/runtime state, assemble commands and tools, and branch into REPL, SDK/headless, assistant, SSH, or remote flows.

**Initialization:**
- Location: `src/entrypoints/init.ts`
- Triggers: `src/main.tsx` pre-action startup.
- Responsibilities: Enable config loading, apply safe environment variables, configure networking, preconnect services, and register shutdown cleanup.

**Interactive REPL:**
- Location: `src/screens/REPL.tsx`
- Triggers: Interactive sessions launched from `src/main.tsx`.
- Responsibilities: Render terminal UI, hold live conversation/task state, merge integrations, and call the query pipeline.

**Headless query engine:**
- Location: `src/QueryEngine.ts`
- Triggers: Non-interactive CLI and SDK-style execution paths.
- Responsibilities: Submit prompts, stream SDK messages, persist transcript state, and reuse the shared query pipeline without the REPL.

**Bridge runtime:**
- Location: `src/bridge/bridgeMain.ts`
- Triggers: `claude remote-control`, `claude rc`, and legacy bridge aliases handled in `src/entrypoints/cli.tsx`.
- Responsibilities: Poll work, spawn local sessions, manage session heartbeats/retries, and report status back to the bridge UI.

**Remote session manager:**
- Location: `src/remote/RemoteSessionManager.ts`
- Triggers: Remote/viewer session flows initialized from `src/main.tsx` and REPL hooks.
- Responsibilities: Manage session WebSocket traffic, forward SDK messages, and mediate remote permission requests.

## Error Handling

**Strategy:** Layered fail-open service initialization with query-time recovery loops and explicit synthetic error messages.

**Patterns:**
- Initialization code in `src/entrypoints/init.ts` and `src/setup.ts` logs and skips non-critical background failures, but exits on required config/security failures.
- Query execution in `src/query.ts` retries recoverable model failures, compacts context on overflow, injects synthetic tool results for interrupted tool uses, and yields assistant/system error messages instead of crashing the session.
- Service wrappers such as `src/services/api/claude.ts`, `src/services/mcp/client.ts`, and `src/remote/RemoteSessionManager.ts` convert transport/auth failures into typed errors or state transitions that the UI can render.

## Cross-Cutting Concerns

**Logging:** Use `src/utils/log.ts`, `src/utils/debug.ts`, and diagnostics helpers such as `src/utils/diagLogs.ts`; bridge and MCP layers add domain-specific logging in `src/bridge/bridgeMain.ts` and `src/services/mcp/client.ts`.
**Validation:** Use schema validation and typed parsers at boundaries, especially in `src/Tool.ts`, `src/tools/AgentTool/loadAgentsDir.ts`, `src/skills/loadSkillsDir.ts`, and API/tool schema builders in `src/services/api/claude.ts`.
**Authentication:** Route provider and session auth through dedicated services/utilities such as `src/utils/auth.ts`, `src/services/oauth/`, `src/services/mcp/auth.ts`, `src/remote/RemoteSessionManager.ts`, and `src/bridge/bridgeMain.ts`.

---

*Architecture analysis: 2026-03-31*
