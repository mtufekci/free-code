# Stack Research

**Domain:** Integrating Ollama as a local model provider in TypeScript/Bun CLI
**Researched:** 2026-03-31
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|----------------|
| **ollama** (official npm) | 0.6.3 | JavaScript SDK for Ollama API | Official Ollama-maintained SDK. Supports chat completions, streaming, tool calling, embeddings. Published Nov 2025, actively maintained. |
| **ANTHROPIC_BASE_URL** env override | N/A | Route existing first-party code to Ollama | Existing codebase already routes via base URL. Ollama's OpenAI-compatible `/v1/chat/completions` endpoint means no new provider variant needed — just set base URL. |
| **OLLAMA_BASE_URL** env var | N/A | Configure Ollama endpoint (local or cloud) | Default `http://localhost:11434` for local; `https://api.ollama.com` for Ollama Cloud. User controls which. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **fetch** (built-in Bun/Node) | N/A | HTTP client for Ollama API | Bun's built-in fetch handles streaming responses. No additional HTTP library needed. |
| **@azure/identity** | ^4.0.0 | Foundry auth pattern reference | Not for Ollama — referenced for comparison. Ollama has no auth library dependency. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **ollama CLI** | Model management | Users install models via `ollama pull`. CLI already exists — do not replicate model mgmt in the app. |
| **Ollama health endpoint** | `/api/tags` | Lightweight check if Ollama is running. Use at startup to fail fast with user-friendly error. |

## Installation

```bash
# Core
bun add ollama

# No additional dependencies — Bun's built-in fetch handles HTTP
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **ollama npm package** | Direct fetch to `/api/chat` | SDK provides type safety, streaming helpers, and future-proofing against API changes. Direct fetch is error-prone with streaming. |
| **Base URL override pattern** | New `APIProvider: 'ollama'` variant | Existing codebase routes first-party via `ANTHROPIC_BASE_URL`. Ollama is OpenAI-compatible — reuse the same path. Adding a new provider variant requires branching in `getAnthropicClient()`, auth logic, model string mapping, etc. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **@anthropic-ai/ollama** | Does not exist | Use `ollama` npm package (official) |
| **Custom HTTP client for streaming** | Bun/Node built-in fetch handles streaming correctly | `ollama` SDK or native fetch |
| **Model management code** | Outside scope — use `ollama` CLI directly | Document `ollama pull <model>` requirement |
| **Hardcoded `localhost:11434`** | Breaks Ollama Cloud support | `OLLAMA_BASE_URL` env var |

## Stack Patterns by Variant

**If using local Ollama (default):**
- Set `OLLAMA_BASE_URL=http://localhost:11434` (or default)
- No API key required
- Health check: `GET /api/tags`

**If using Ollama Cloud:**
- Set `OLLAMA_BASE_URL=https://api.ollama.com`
- No API key required (Ollama Cloud uses same OpenAI-compatible API)
- Health check: `GET /api/tags` against cloud endpoint

**If Ollama is unavailable at startup:**
- Fail fast with explicit error: "Ollama is configured but not reachable at http://localhost:11434. Start Ollama or unset OLLAMA_BASE_URL."
- Do NOT silently fall through to cloud provider

## Version Compatibility

| Package | Compatible With | Notes |
|--------|-----------------|-------|
| `ollama@0.6.3` | Bun 1.x, Node 18+ | Uses native fetch — no polyfill needed |
| Existing `@anthropic-ai/sdk` | Bun, Node | Existing first-party path unchanged |
| Existing `@anthropic-ai/bedrock-sdk` | Bun, Node | Existing Bedrock path unchanged |
| Existing `@anthropic-ai/vertex-sdk` | Bun, Node | Existing Vertex path unchanged |
| Existing `@anthropic-ai/foundry-sdk` | Bun, Node | Existing Foundry path unchanged |

## Architecture Notes

### Integration Pattern
```
Existing flow: ANTHROPIC_BASE_URL → first-party Anthropic API
New flow: OLLAMA_BASE_URL → Ollama OpenAI-compatible endpoint
```

No new provider variant. No changes to `APIProvider` type union. Ollama routes through existing first-party code path with a different base URL.

### Required Changes (minimal)
1. Add `CLAUDE_CODE_USE_OLLAMA` env var detection in `providers.ts` (optional toggle)
2. Add `OLLAMA_BASE_URL` env var handling (defaults to `http://localhost:11434`)
3. Set `ANTHROPIC_BASE_URL` to `OLLAMA_BASE_URL` when Ollama is enabled
4. Add health check at startup against `OLLAMA_BASE_URL/api/tags`
5. Map model IDs appropriately (Ollama uses `llama3.2`, not `claude-opus-4-6`)

### Response Shape Compatibility
Ollama's `/v1/chat/completions` response is OpenAI-compatible. Verify streaming format (`data: {...}\n\n`) matches what the existing code expects.

## Sources

- [ollama npm package](https://www.npmjs.com/package/ollama) — v0.6.3, published 2025-11-13, official Ollama maintainers
- [Ollama API documentation](https://github.com/ollama/ollama/blob/main/docs/api.md) — confirmed OpenAI-compatible `/v1/chat/completions`, streaming, tool calling support
- Existing codebase patterns in `src/services/api/client.ts` — first-party provider routing
- Existing codebase patterns in `src/utils/model/providers.ts` — `APIProvider` type and `getAPIProvider()` function

---
*Stack research for: Ollama model provider integration*
*Researched: 2026-03-31*
