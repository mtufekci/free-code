# External Integrations

**Analysis Date:** 2026-03-31

## APIs & External Services

**LLM providers:**
- Anthropic first-party API - Primary Messages API integration used by `src/services/api/client.ts` and `src/services/api/claude.ts`
  - SDK/Client: `@anthropic-ai/sdk`
  - Auth: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or Claude.ai OAuth token managed in `src/utils/auth.ts`
- AWS Bedrock - Alternate Anthropic model provider selected in `src/services/api/client.ts`
  - SDK/Client: `@anthropic-ai/bedrock-sdk`, `@aws-sdk/client-bedrock`, `@aws-sdk/client-bedrock-runtime`
  - Auth: AWS default credentials or `AWS_BEARER_TOKEN_BEDROCK`; enable with `CLAUDE_CODE_USE_BEDROCK`
- Google Vertex AI - Alternate Anthropic model provider selected in `src/services/api/client.ts`
  - SDK/Client: `@anthropic-ai/vertex-sdk`, `google-auth-library`
  - Auth: GCP ADC / `GOOGLE_APPLICATION_CREDENTIALS`; requires `ANTHROPIC_VERTEX_PROJECT_ID` and `CLAUDE_CODE_USE_VERTEX`
- Microsoft Foundry - Alternate Anthropic model provider selected in `src/services/api/client.ts`
  - SDK/Client: `@anthropic-ai/foundry-sdk`, `@azure/identity`
  - Auth: `ANTHROPIC_FOUNDRY_API_KEY` or Azure AD credential flow; enable with `CLAUDE_CODE_USE_FOUNDRY`

**Authentication and account APIs:**
- Anthropic OAuth / Claude.ai OAuth - Browser login, token exchange, refresh, roles, and API key creation in `src/constants/oauth.ts`, `src/services/oauth/client.ts`, and `src/services/oauth/auth-code-listener.ts`
  - SDK/Client: `axios`
  - Auth: OAuth PKCE flow using values from `src/constants/oauth.ts`; optional overrides include `CLAUDE_CODE_CUSTOM_OAUTH_URL` and `CLAUDE_CODE_OAUTH_CLIENT_ID`
- Bootstrap API - Fetches client data and additional model options from `${BASE_API_URL}/api/claude_cli/bootstrap` in `src/services/api/bootstrap.ts`
  - SDK/Client: `axios`
  - Auth: Bearer OAuth or `ANTHROPIC_API_KEY`
- Admin request APIs - Team/enterprise admin workflows in `src/services/api/adminRequests.ts`
  - SDK/Client: `axios`
  - Auth: OAuth bearer token plus `x-organization-uuid`

**Files and remote session services:**
- Anthropic Files API - File upload, download, and listing in `src/services/api/filesApi.ts`
  - SDK/Client: `axios`
  - Auth: OAuth bearer token
- Session ingress / teleport APIs - Session log append/fetch and teleport events in `src/services/api/sessionIngress.ts`
  - SDK/Client: `axios`
  - Auth: session ingress token or OAuth bearer token
- Sessions WebSocket API - Remote session subscription in `src/remote/SessionsWebSocket.ts`
  - SDK/Client: native `WebSocket` or `ws`
  - Auth: OAuth bearer token in headers

**Feature flags and remote config:**
- GrowthBook - Remote feature flags and dynamic config in `src/services/analytics/growthbook.ts`
  - SDK/Client: `@growthbook/growthbook`
  - Auth: auth headers from `src/utils/http.ts`; client keys from `src/constants/keys.ts`

**Plugin and marketplace services:**
- Official plugin marketplace on GitHub - Default plugin source in `src/utils/plugins/officialMarketplace.ts` and `src/utils/plugins/marketplaceManager.ts`
  - SDK/Client: git CLI and `axios`
  - Auth: GitHub credentials handled by git/credential helper when needed
- Official plugin marketplace GCS mirror - Zip download mirror in `src/utils/plugins/officialMarketplaceGcs.ts`
  - SDK/Client: `axios`
  - Auth: none detected
- Raw GitHub install counts - Plugin stats fetch in `src/utils/plugins/installCounts.ts`
  - SDK/Client: `axios`
  - Auth: none detected

**MCP services:**
- Anthropic MCP proxy - Hosted MCP proxy endpoint configured in `src/constants/oauth.ts` and consumed by `src/services/mcp/client.ts`
  - SDK/Client: MCP HTTP transport
  - Auth: Claude.ai OAuth token
- Local MCP server - Exposes Claude tools over stdio in `src/entrypoints/mcp.ts`
  - SDK/Client: `@modelcontextprotocol/sdk`
  - Auth: local process only

## Data Storage

**Databases:**
- Not detected - no application database client, ORM, or schema files were found
  - Connection: Not applicable
  - Client: Not applicable

**File Storage:**
- Anthropic Files API for remote file objects in `src/services/api/filesApi.ts`
- Local filesystem caches and config storage under the user profile in `src/utils/config.ts` and `src/utils/plugins/marketplaceManager.ts`

**Caching:**
- Local disk cache only - GrowthBook values are cached in global config via `src/services/analytics/growthbook.ts` and `src/utils/config.ts`
- Local marketplace cache only - plugin marketplace manifests/repos are cached under paths managed by `src/utils/plugins/marketplaceManager.ts`

## Authentication & Identity

**Auth Provider:**
- Hybrid custom auth model using Anthropic API keys plus Claude.ai OAuth
  - Implementation: API key lookup and storage in `src/utils/auth.ts`; OAuth PKCE flow in `src/services/oauth/client.ts` and `src/services/oauth/auth-code-listener.ts`
- Provider-specific cloud auth is supported for Bedrock, Vertex, and Foundry in `src/services/api/client.ts`

## Monitoring & Observability

**Error Tracking:**
- None in this OSS build - `src/services/analytics/datadog.ts`, `src/services/analytics/index.ts`, and `src/services/analytics/sink.ts` are inert stubs

**Logs:**
- Local debug/error logging through helpers such as `src/utils/log.js` and `src/utils/debug.js`
- No active outbound telemetry sink is enabled in the current build according to `src/services/analytics/index.ts`

## CI/CD & Deployment

**Hosting:**
- User-machine CLI distribution, built locally by `scripts/build.ts` and installed by `install.sh`

**CI Pipeline:**
- None detected in repository configuration - no `.github/workflows/*` files were found
- Workflow templates for GitHub Actions exist as string constants in `src/constants/github-app.ts`, but they are not active repo workflows

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` for direct Anthropic API auth, referenced in `README.md` and `src/services/api/client.ts`
- `CLAUDE_CODE_USE_BEDROCK` plus AWS credentials / region variables for Bedrock, referenced in `src/services/api/client.ts`
- `CLAUDE_CODE_USE_VERTEX` plus `ANTHROPIC_VERTEX_PROJECT_ID` and GCP credentials for Vertex, referenced in `src/services/api/client.ts`
- `CLAUDE_CODE_USE_FOUNDRY` plus `ANTHROPIC_FOUNDRY_RESOURCE` or `ANTHROPIC_FOUNDRY_BASE_URL`, and optionally `ANTHROPIC_FOUNDRY_API_KEY`, referenced in `src/services/api/client.ts`
- `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` for outbound network proxying, referenced in `src/utils/proxy.ts`

**Secrets location:**
- Environment variables for API/provider credentials in `src/services/api/client.ts` and `src/utils/proxy.ts`
- macOS Keychain or secure storage backend through `src/utils/auth.ts`
- Global config fallback for some persisted values through `src/utils/config.ts`

## Webhooks & Callbacks

**Incoming:**
- Local OAuth redirect callback on `http://localhost:{port}/callback` handled by `src/services/oauth/auth-code-listener.ts`
- Remote session WebSocket subscription at `/v1/sessions/ws/{sessionId}/subscribe` handled by `src/remote/SessionsWebSocket.ts`

**Outgoing:**
- Browser redirect to OAuth success pages defined in `src/constants/oauth.ts` and triggered by `src/services/oauth/auth-code-listener.ts`
- Remote MCP proxy calls to `MCP_PROXY_URL + MCP_PROXY_PATH` from `src/services/mcp/client.ts`

---

*Integration audit: 2026-03-31*
