# Technology Stack

**Analysis Date:** 2026-03-31

## Languages

**Primary:**
- TypeScript - Application code and build logic in `src/**/*.ts`, `src/**/*.tsx`, and `scripts/build.ts`

**Secondary:**
- Bash - Install/bootstrap automation in `install.sh`
- JSON - Project and compiler configuration in `package.json` and `tsconfig.json`

## Runtime

**Environment:**
- Bun >= 1.3.11 - Required by `package.json`, used to run the CLI entrypoint in `src/entrypoints/cli.tsx`, and used for builds in `scripts/build.ts`

**Package Manager:**
- Bun 1.3.11 - Declared in `package.json`
- Lockfile: present in `bun.lock`

## Frameworks

**Core:**
- Bun runtime and bundler - CLI runtime and feature-flag bundling in `src/entrypoints/cli.tsx` and `scripts/build.ts`
- React 19 - Terminal UI rendering in `package.json` and UI files such as `src/screens/REPL.tsx`
- Ink 6 - React-based terminal UI in `package.json`
- Commander extra typings - CLI command parsing/types in `package.json`
- Model Context Protocol SDK - MCP server/client support in `src/entrypoints/mcp.ts` and `src/services/mcp/client.ts`

**Testing:**
- Not detected - no `jest.config.*`, `vitest.config.*`, or test runner config files were found at the repository root

**Build/Dev:**
- Bun build pipeline - Build orchestration in `scripts/build.ts`
- TypeScript compiler - Type checking/transpile configuration in `tsconfig.json`

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk` - Primary Anthropic Messages API client used by `src/services/api/client.ts` and `src/services/api/claude.ts`
- `@anthropic-ai/claude-agent-sdk` - Agent SDK support declared in `package.json`
- `react` and `ink` - Terminal UI stack used from `src/screens/*`, `src/components/*`, and `src/entrypoints/cli.tsx`
- `zod` - Runtime schema validation across settings, plugins, and API payloads in files such as `src/services/api/bootstrap.ts` and `src/utils/settings/types.ts`
- `axios` - HTTP client used for OAuth, plugin marketplace, files API, bootstrap, and session APIs in `src/services/oauth/client.ts`, `src/services/api/bootstrap.ts`, `src/services/api/filesApi.ts`, and `src/utils/plugins/marketplaceManager.ts`

**Infrastructure:**
- `@anthropic-ai/bedrock-sdk` and `@aws-sdk/*` - AWS Bedrock provider support in `src/services/api/client.ts`
- `@anthropic-ai/vertex-sdk` and `google-auth-library` - Google Vertex AI provider support in `src/services/api/client.ts`
- `@anthropic-ai/foundry-sdk` and `@azure/identity` - Azure Foundry provider support in `src/services/api/client.ts`
- `@growthbook/growthbook` - Remote feature flags/config in `src/services/analytics/growthbook.ts`
- `ws` - Node WebSocket transport used in `src/remote/SessionsWebSocket.ts`
- `chokidar` - Filesystem watching used in `src/utils/settings/changeDetector.ts` and `src/utils/skills/skillChangeDetector.ts`
- `sharp` - Image processing dependency declared in `package.json`

## Configuration

**Environment:**
- Runtime behavior is heavily environment-driven through `process.env` usage in `src/services/api/client.ts`, `src/constants/oauth.ts`, `src/utils/proxy.ts`, and `src/utils/auth.ts`
- Primary auth paths use `ANTHROPIC_API_KEY`, OAuth token storage from `src/utils/auth.ts`, or provider-specific credentials selected in `src/services/api/client.ts`
- Third-party provider toggles use `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, and `CLAUDE_CODE_USE_FOUNDRY` in `src/services/api/client.ts`
- Network/proxy configuration uses `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`, and `ANTHROPIC_UNIX_SOCKET` in `src/utils/proxy.ts`
- OAuth endpoints and overrides are configured in `src/constants/oauth.ts`
- No `.env*` files were detected at the repository root during this scan

**Build:**
- `package.json` - Scripts, dependencies, Bun version, and bin targets
- `tsconfig.json` - TypeScript compiler options and `src/*` path alias
- `scripts/build.ts` - Build output, compile mode, feature flags, defines, and bundling behavior
- `install.sh` - Installer flow for Bun install, clone, dependency install, and build

## Platform Requirements

**Development:**
- Bun >= 1.3.11 required by `package.json` and documented in `README.md`
- Git required by `install.sh`
- macOS or Linux documented in `README.md` and enforced by `install.sh`
- Windows is supported via WSL according to `README.md`

**Production:**
- Deployment target is a local Bun-compiled CLI binary output to `./cli`, `./cli-dev`, or `./dist/cli` by `scripts/build.ts`
- Install path/symlink workflow targets user machines rather than a server platform, via `install.sh`

---

*Stack analysis: 2026-03-31*
