# Project Research Summary

**Project:** Claude Code Ollama Integration
**Domain:** CLI Coding Assistant with Local Model Provider
**Researched:** 2026-03-31
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project adds Ollama as a local model provider for Claude Code, enabling offline coding assistance with locally-running LLMs. Unlike the three existing cloud providers (Bedrock, Vertex, Foundry), Ollama is not a dedicated AI API—it is a local runtime exposing an OpenAI-compatible REST endpoint. The correct integration pattern is **base URL override**, not a new provider variant. The existing first-party code path routes via `ANTHROPIC_BASE_URL`; pointing this at Ollama's OpenAI-compatible endpoint (`/v1/chat/completions`) reuses the existing flow without branching into new `APIProvider` territory.

The research is confident on the technical approach but identifies seven critical pitfalls unique to local model providers: model keep-alive exhaustion, streaming format translation, tool calling capability variance, context window mismatch, missing health checks, and silent cloud fallback. These are not present in the cloud provider integrations and require dedicated handling.

## Key Findings

### Recommended Stack

The integration uses the official `ollama` npm package (v0.6.3) with Bun's built-in fetch for HTTP. No new provider variant should be added to `APIProvider`—instead, `ANTHROPIC_BASE_URL` is pointed at Ollama's OpenAI-compatible endpoint. The `OLLAMA_BASE_URL` env var configures the endpoint (default: `http://localhost:11434` for local, `https://api.ollama.com` for cloud). `OLLAMA_API_KEY` is optional for cloud. A health check against `/api/tags` verifies connectivity at startup.

**Core technologies:**
- **ollama (npm)** — Official Ollama-maintained JS SDK with chat, streaming, and tool calling support
- **OLLAMA_BASE_URL env var** — Routes existing first-party code to Ollama without new provider branch
- **ANTHROPIC_BASE_URL override** — OpenAI-compatible endpoint means existing flow reused with different base URL
- **Bun built-in fetch** — Handles HTTP and streaming; no additional dependencies

### Expected Features

**Must have (table stakes):**
- Provider toggle (`CLAUDE_CODE_USE_OLLAMA=1`) — same pattern as existing cloud provider flags
- OpenAI-compatible API client — routes via base URL to `/v1/chat/completions`
- Local connection to `localhost:11434` by default
- Cloud endpoint support via `OLLAMA_BASE_URL` for Ollama Cloud
- Health check on startup — fail fast with clear message if Ollama unreachable
- Explicit error when configured but unreachable — no silent cloud fallback

**Should have (competitive):**
- Automatic local Ollama discovery — zero-config if Ollama is running
- Dynamic model list from `/api/tags` — show available models without manual config
- Model recommendation for coding — suggest deepseek-coder, codellama from available models

**Defer (v2+):**
- Ollama model management (pull, delete) — use `ollama` CLI instead; scope creep
- Streaming output customization — complexity without user value for CLI
- Non-CLI modes (daemon, bridge) — YAGNI

### Architecture Approach

The architecture is a **base URL override** layered onto the existing first-party provider path. Ollama exposes an OpenAI-compatible `/v1/chat/completions` endpoint, so the integration point is `ANTHROPIC_BASE_URL` and custom headers—not a new branch in `getAnthropicClient()`.

**Major components:**
1. **Ollama client module** (`src/services/api/ollamaClient.ts`) — Ollama-specific configuration: base URL, auth headers, keep_alive settings
2. **Provider detection** (`src/utils/model/providers.ts`) — Detects `CLAUDE_CODE_USE_OLLAMA` and `OLLAMA_BASE_URL`; does NOT add 'ollama' to APIProvider union
3. **Streaming translation layer** — Maps Ollama's plain JSON streaming format to internal event shape expected by existing consumers
4. **Tool call adapter** — Translates Ollama tool call format (`tool_calls` in message) to internal tool orchestration format
5. **Model capability detection** — Queries `/api/show` for `context_length` and capability flags; drives compaction thresholds and tool calling fallback

### Critical Pitfalls

1. **Endpoint/Auth Model Mismatch** — Ollama is not a cloud provider. Do NOT add 'ollama' to `APIProvider` type. Treat it as a configurable base URL override. Prevention: architecture review before code.

2. **Model Loading Exhaustion** — Default `keep_alive=5m` means model reloads every request (5-30s latency). Must set `keep_alive=24h` and implement background ping to keep model warm.

3. **Streaming Format Incompatibility** — Ollama streams plain JSON lines, not Anthropic SSE. Existing streaming parser will fail. Must build translation layer mapping `message.content` deltas → internal text events.

4. **Tool Calling Capability Variance** — Most local models (especially quantized) do not support reliable tool calling. API accepts tools param but model may ignore or produce malformed JSON. Must query `/api/show` and fallback gracefully.

5. **Context Window Mismatch** — Claude has 200k+ context; Ollama models often have 4k-32k. Compaction thresholds tuned for Claude are wrong for small-context models. Query `/api/show` for `context_length` and adjust.

## Implications for Roadmap

Based on research, the following phase structure emerges from the component build order and pitfall prevention requirements:

### Phase 1: Foundation & Health Check
**Rationale:** No other phase can proceed without verifying Ollama is reachable. This phase establishes the configuration layer and fails fast—preventing the "silent cloud fallback" pitfall.

**Delivers:**
- `OLLAMA_BASE_URL` env var with default `http://localhost:11434`
- `OLLAMA_API_KEY` env var (optional, for cloud)
- Health check against `/api/tags` on startup
- Explicit error if Ollama configured but unreachable—no silent fallback
- `ollama status` command reporting connection state

**Implements:** Stack elements: `ollama` npm package, health endpoint pattern

### Phase 2: Core Integration with Streaming
**Rationale:** The base URL override pattern reuses the existing first-party flow, but Ollama's streaming format is incompatible with the existing SSE parser. This phase builds the translation layer, which is required before any conversation functionality works.

**Delivers:**
- `src/services/api/ollamaClient.ts` with Ollama SDK configuration
- Streaming translation layer (Ollama JSON lines → internal event shape)
- Basic chat completions via `/v1/chat/completions`
- `keep_alive` set to 24h and background ping mechanism
- Model name mapping (Ollama models use `llama3.2`, not `claude-opus-4-6`)

**Avoids:** Pitfalls 2 (model loading), 3 (streaming format)

### Phase 3: Model Discovery & Selection
**Rationale:** After basic connectivity works, users need to select and validate models. This phase adds the model list API and context window detection, enabling proper compaction thresholds.

**Delivers:**
- Dynamic model list from `/api/tags`
- Context window detection via `/api/show`
- Compaction threshold adjustment per-model
- Model selection UI/UX

**Avoids:** Pitfall 5 (context window mismatch)

### Phase 4: Tool Calling & Capability Detection
**Rationale:** Tool calling is the core value proposition for a coding CLI. This phase is complex because tool calling capability varies by model, and the streaming translation layer must also handle tool call events.

**Delivers:**
- Ollama tool call format → internal format translation
- Model capability detection via `/api/show`
- Graceful fallback to non-tool-call mode when model incapable
- Clear user message when model doesn't support tools

**Avoids:** Pitfalls 4 (tool calling capability)

### Phase 5: Polish & Zero-Config Experience
**Rationale:** After all functional pieces work individually, this phase wires automatic discovery, model recommendations, and UX improvements that differentiate from competitors.

**Delivers:**
- Automatic local Ollama discovery (probe localhost:11434 on startup)
- Model recommendation engine (suggest coding-optimized models)
- Provider/model indicator in REPL prompt
- Documentation for `ollama pull` requirement

### Phase Ordering Rationale

- **Phase 1 before 2:** Health check is prerequisite; no point building integration on unreachable infrastructure
- **Phase 2 before 3:** Streaming must work before model list has value; model listenhances user experience but isn't architecturally foundational
- **Phase 3 before 4:** Model discovery enables capability detection which is required for tool calling fallback
- **Phase 4 before 5:** Tool calling is core CLI value; polish is additive, not foundational

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 4 (Tool Calling):** Complex integration—Ollama tool call streaming format differs from Anthropic; needs end-to-end testing with various models; recommend dedicated research if implementing
- **Phase 5 (Zero-Config):** Ollama auto-discovery has edge cases around model availability vs. model loaded state

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Health Check):** Well-documented pattern in Ollama (`/api/tags` endpoint); existing codebase has health check patterns to follow
- **Phase 2 (Streaming Translation):** OpenAI-compatible streaming is documented; translation layer pattern is straightforward adapter

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Ollama SDK documented; base URL override pattern verified against existing codebase |
| Features | HIGH | Feature set validated against existing provider patterns and competitor analysis |
| Architecture | HIGH | Build order, component boundaries, and anti-patterns all confirmed against codebase |
| Pitfalls | MEDIUM-HIGH | Seven pitfalls documented with prevention strategies; some based on Ollama API docs rather than hands-on testing with diverse models |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Ollama model diversity:** Research based on API documentation and general Ollama behavior. Specific models (llama3.2, codellama, deepseek-coder variants) may have unique quirks. Recommend validation during Phase 3-4 with target models.
- **Tool calling reliability:** Documented capability varies widely. Hands-on testing with intended models needed before Phase 4 is fully specced.
- **Streaming translation implementation:** The internal streaming event shape was not directly examined in research. Implementation may reveal additional complexity not captured in the streaming translation layer design.

## Sources

### Primary (HIGH confidence)
- [ollama npm package](https://www.npmjs.com/package/ollama) — v0.6.3, official Ollama-maintained SDK
- [Ollama API documentation](https://github.com/ollama/ollama/blob/main/docs/api.md) — confirmed OpenAI-compatible `/v1/chat/completions`, streaming, tool calling
- [OpenAI-compatible API endpoints](https://github.com/ollama/ollama/blob/main/docs/openai.md) — confirmed compatibility layer
- Existing codebase: `src/services/api/client.ts` — confirmed provider routing and first-party flow
- Existing codebase: `src/utils/model/providers.ts` — confirmed APIProvider type and detection pattern

### Secondary (MEDIUM confidence)
- [Ollama JavaScript Library GitHub](https://github.com/ollama/ollama-js) — SDK implementation details
- Community patterns in existing Ollama integrations — general integration approaches

### Tertiary (LOW confidence)
- Model-specific tool calling capability — varies by model and quantization; needs hands-on testing

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
