# Codebase Structure

**Analysis Date:** 2026-03-31

## Directory Layout

```text
[project-root]/
├── .planning/codebase/   # Generated architecture/reference docs for planning workflows
├── assets/               # Static repo assets such as screenshots
├── scripts/              # Build and automation scripts, including `scripts/build.ts`
├── src/                  # Application source code
├── package.json          # Bun package manifest and CLI script definitions
├── tsconfig.json         # TypeScript compiler configuration
└── README.md             # Project overview, build, and usage instructions
```

## Directory Purposes

**`src/entrypoints/`:**
- Purpose: Process bootstrap and alternate runtime entrypoints.
- Contains: `cli.tsx`, `init.ts`, `mcp.ts`, and SDK-related startup files.
- Key files: `src/entrypoints/cli.tsx`, `src/entrypoints/init.ts`

**`src/commands/`:**
- Purpose: Slash-command implementations.
- Contains: Command feature folders and single-file commands.
- Key files: `src/commands/plan/index.ts`, `src/commands/mcp/index.ts`, `src/commands/review.ts`, `src/commands/statusline.tsx`

**`src/tools/`:**
- Purpose: Model-callable tool implementations.
- Contains: One folder per tool plus shared tool helpers.
- Key files: `src/tools/BashTool/BashTool.ts`, `src/tools/FileReadTool/FileReadTool.ts`, `src/tools/AgentTool/AgentTool.ts`, `src/tools/SkillTool/SkillTool.ts`

**`src/services/`:**
- Purpose: Service integrations and cross-cutting runtime subsystems.
- Contains: API clients, MCP, analytics, LSP, compaction, sync, tips, and feature-specific service modules.
- Key files: `src/services/api/claude.ts`, `src/services/mcp/client.ts`, `src/services/analytics/index.ts`, `src/services/lsp/manager.ts`

**`src/screens/`:**
- Purpose: Top-level screen components.
- Contains: Main REPL and supporting screen flows.
- Key files: `src/screens/REPL.tsx`, `src/screens/ResumeConversation.tsx`, `src/screens/Doctor.tsx`

**`src/components/`:**
- Purpose: Reusable Ink/React UI components.
- Contains: Message rendering, dialogs, task UI, permissions UI, pickers, and specialized feature panels.
- Key files: `src/components/Messages.tsx`, `src/components/TaskListV2.tsx`, `src/components/FullscreenLayout.tsx`, `src/components/permissions/`

**`src/hooks/`:**
- Purpose: React hooks that connect UI, state, and services.
- Contains: Session hooks, merged tool/command hooks, remote hooks, UI behavior hooks, and notification hooks.
- Key files: `src/hooks/useMergedTools.ts`, `src/hooks/useMergedCommands.ts`, `src/hooks/useRemoteSession.ts`, `src/hooks/useCanUseTool.tsx`

**`src/state/`:**
- Purpose: React store shape and access helpers.
- Contains: The AppState schema, provider, selectors, and store primitive.
- Key files: `src/state/AppStateStore.ts`, `src/state/AppState.tsx`, `src/state/store.ts`

**`src/bootstrap/`:**
- Purpose: Process-wide mutable state outside React.
- Contains: Session identity, cwd, telemetry counters, and runtime flags.
- Key files: `src/bootstrap/state.ts`

**`src/skills/`:**
- Purpose: Skill loading and bundled skill registration.
- Contains: Bundled skills, MCP skill builders, and filesystem skill loaders.
- Key files: `src/skills/loadSkillsDir.ts`, `src/skills/bundledSkills.ts`, `src/skills/bundled/`

**`src/tasks/`:**
- Purpose: Background task implementations and task type helpers.
- Contains: Local agent, remote agent, shell, teammate, and dream task logic.
- Key files: `src/tasks/LocalAgentTask/LocalAgentTask.ts`, `src/tasks/RemoteAgentTask/RemoteAgentTask.ts`, `src/tasks/types.ts`

**`src/remote/`:**
- Purpose: Remote session transport and adapter logic.
- Contains: Remote session manager, WebSocket wrapper, and permission bridge adapters.
- Key files: `src/remote/RemoteSessionManager.ts`, `src/remote/SessionsWebSocket.ts`

**`src/bridge/`:**
- Purpose: Bridge / remote-control server runtime.
- Contains: Poll loop, bridge API client, session spawning, bridge UI, and transport helpers.
- Key files: `src/bridge/bridgeMain.ts`, `src/bridge/bridgeApi.ts`, `src/bridge/sessionRunner.ts`

**`src/query/`:**
- Purpose: Query-loop support modules.
- Contains: Query config, dependency wiring, stop-hook handling, and token-budget helpers.
- Key files: `src/query/config.ts`, `src/query/deps.ts`, `src/query/stopHooks.ts`

**`src/utils/`:**
- Purpose: Shared low-level utilities used across every layer.
- Contains: Filesystem, git, auth, prompt, telemetry, permissions, session storage, formatting, and many domain helpers.
- Key files: `src/utils/messages.ts`, `src/utils/sessionStorage.ts`, `src/utils/auth.ts`, `src/utils/permissions/`, `src/utils/plugins/`

## Key File Locations

**Entry Points:**
- `src/entrypoints/cli.tsx`: Primary binary bootstrap and fast-path router
- `src/main.tsx`: Main CLI runtime and argument orchestration
- `src/screens/REPL.tsx`: Interactive terminal UI entry screen
- `src/QueryEngine.ts`: Headless/SDK conversation engine
- `src/bridge/bridgeMain.ts`: Bridge-mode runtime entry
- `src/remote/RemoteSessionManager.ts`: Remote-session transport entry

**Configuration:**
- `package.json`: Runtime scripts, dependencies, binary names, and Bun version
- `tsconfig.json`: TypeScript compiler settings
- `src/entrypoints/init.ts`: Runtime configuration/bootstrap activation
- `src/bootstrap/state.ts`: Process-wide runtime configuration state

**Core Logic:**
- `src/commands.ts`: Global command registry
- `src/tools.ts`: Global tool registry and tool-pool assembly
- `src/query.ts`: Core query loop
- `src/Tool.ts`: Canonical tool contract
- `src/context.ts`: System/user context assembly
- `src/setup.ts`: Session setup before first render/query

**Testing:**
- Not detected as a top-level dedicated test directory in this snapshot

## Naming Conventions

**Files:**
- React hooks use `useX` names in `src/hooks/`, for example `src/hooks/useMergedCommands.ts`.
- Top-level React/Ink components use PascalCase filenames, for example `src/components/TaskListV2.tsx` and `src/components/FullscreenLayout.tsx`.
- Tool folders use PascalCase + `Tool`, with the main implementation inside the folder, for example `src/tools/BashTool/BashTool.ts` and `src/tools/AgentTool/AgentTool.ts`.
- Command implementations are usually kebab-case feature folders with `index.ts` / `index.tsx`, for example `src/commands/release-notes/index.ts` and `src/commands/install-github-app/index.ts`; smaller commands also appear as single files such as `src/commands/review.ts`.

**Directories:**
- Feature/domain directories are grouped by responsibility, for example `src/services/mcp/`, `src/services/api/`, `src/components/permissions/`, and `src/tasks/RemoteAgentTask/`.
- Tool directories use PascalCase domain folders, for example `src/tools/FileReadTool/`.
- Command directories mostly use kebab-case names mirroring the slash command, for example `src/commands/add-dir/` and `src/commands/rate-limit-options/`.

## Where to Add New Code

**New Feature:**
- Primary code: Add domain logic under the closest feature area, usually `src/services/<domain>/`, `src/utils/<domain>.ts`, or `src/components/<Feature>/`.
- Tests: Not applicable in a single dedicated location; place tests alongside the established test setup once a target test framework/file pattern is confirmed.

**New Component/Module:**
- Implementation: Put reusable UI in `src/components/` and supporting React behavior in `src/hooks/`.
- Screen-level composition: Put new full-screen REPL flows in `src/screens/`.

**Utilities:**
- Shared helpers: Add cross-cutting helpers to `src/utils/` only when they are used across multiple domains.
- Domain-specific helpers: Prefer `src/services/<domain>/` or a local feature folder before adding another generic utility.

**New slash command:**
- Implementation: Add a folder or file under `src/commands/`.
- Registration: Wire it into `src/commands.ts`.

**New tool:**
- Implementation: Add a folder under `src/tools/<Name>Tool/`.
- Registration: Wire it into `src/tools.ts`.

**New skill-loading behavior:**
- Loader logic: Update `src/skills/loadSkillsDir.ts`.
- Bundled skill registration: Update files under `src/skills/bundled/` and `src/skills/bundledSkills.ts`.

**New background task type:**
- Implementation: Add a task feature folder under `src/tasks/`.
- Type wiring: Update `src/Task.ts` and `src/tasks/types.ts`.

## Special Directories

**`src/skills/bundled/`:**
- Purpose: Bundled built-in skills shipped with the application
- Generated: No
- Committed: Yes

**`src/migrations/`:**
- Purpose: Startup migrations applied from `src/main.tsx`
- Generated: No
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: Generated planning/reference documents consumed by GSD workflows
- Generated: Yes
- Committed: Yes

**`src/query/`:**
- Purpose: Query-loop helper modules extracted from the main query pipeline
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-03-31*
