# Roadmap: Add Ollama Support

**Project:** Claude Code Ollama Integration
**Depth:** comprehensive
**Created:** 2026-03-31

## Phases

- [x] **Phase 1: Foundation & Health Check** - Provider config, connection validation, error handling (Complete)
- [x] **Phase 2: Core Chat Integration** - Streaming, completions, model discovery (completed 2026-04-01)
- [x] **Phase 3: Tool Calling & Discovery** - Tool call support, context window detection (completed 2026-04-01)
- [ ] **Phase 4: Zero-Config Experience** - Auto-detection and suggestions
- [x] **Phase 5: Polish & Edge Cases** - Edge case handling, UX polish, regression verification (Complete 2026-04-01)

## Phase Details

### Phase 1: Foundation & Health Check

**Goal:** User can configure Ollama and system validates connectivity before use

**Depends on:** Nothing (first phase)

**Requirements:** PROV-01, PROV-02, PROV-03, CONN-01, CONN-02, CONN-03, ERR-01, ERR-02, ERR-03

**Success Criteria** (what must be TRUE):
1. User can enable Ollama by setting `CLAUDE_CODE_USE_OLLAMA=true` environment variable
2. User can configure Ollama base URL via `OLLAMA_BASE_URL` env var (defaults to `http://localhost:11434`)
3. User can configure Ollama model via `OLLAMA_MODEL` env var (defaults to auto-detected)
4. System performs Ollama health check on startup when enabled and fails fast with clear error if unreachable
5. System validates Ollama API version compatibility on connect
6. Ollama connection errors show actionable messages (not raw API errors)
7. Ollama timeout and rate-limit errors are handled gracefully
8. System can fall back to cloud provider if Ollama is unavailable when both are configured

**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Ollama provider configuration via env vars
- [x] 01-02-PLAN.md — Startup health check with reachability validation
- [x] 01-03-PLAN.md — Ollama-specific error formatting

---

### Phase 2: Core Chat Integration

**Goal:** User can conduct full conversations with Ollama models via streaming REPL

**Depends on:** Phase 1

**Requirements:** CHAT-01, CHAT-02, CHAT-03, CHAT-04, MODL-01, MODL-02, MODL-04

**Success Criteria** (what must be TRUE):
1. User can send prompts and receive responses from Ollama models
2. Streaming responses render correctly in the terminal REPL as they arrive
3. Ollama response format is translated to match expected internal event shape
4. Connection handles Ollama keep-alive and session persistence (24h keep_alive, background ping)
5. System can list available Ollama models via `/api/tags`
6. System detects model context window size from Ollama API
7. User can see which model is active and its capabilities in the REPL

**Plans:** 5/5 plans complete

Plans:
- [x] 02-01-PLAN.md — Ollama API type definitions
- [x] 02-02-PLAN.md — Ollama client with SSE translation (interceptor)
- [x] 02-03-PLAN.md — Client integration into getAnthropicClient()
- [x] 02-04-PLAN.md — Model discovery and listing

---

### Phase 3: Tool Calling & Discovery

**Goal:** Tool calling works with Ollama models that support it; graceful fallback for models that don't

**Depends on:** Phase 2

**Requirements:** TOOL-01, TOOL-02, TOOL-03, TOOL-04, MODL-03

**Success Criteria** (what must be TRUE):
1. Tool call requests are formatted for Ollama's `tool_calls` API correctly
2. Ollama tool call responses are translated to internal format
3. System detects when model does not support tools and falls back gracefully
4. Tool calling is disabled for known-unsupported models with user-visible notice
5. Context window limits are respected to prevent silent truncation

**Plans:** 5/5 plans complete

Plans:
- [x] 03-01-PLAN.md — Tool call request formatting (TOOL-01)
- [x] 03-02-PLAN.md — Tool call response streaming translation (TOOL-02)
- [ ] 03-03-PLAN.md — Context window enforcement via num_ctx (MODL-03)
- [ ] 03-04-PLAN.md — Model capability detection and graceful fallback (TOOL-03)
- [ ] 03-05-PLAN.md — User-visible notice when tools disabled (TOOL-04)

---

### Phase 4: Zero-Config Experience

**Goal:** System automatically detects and suggests Ollama when available

**Depends on:** Phase 1

**Requirements:** PROV-04

**Success Criteria** (what must be TRUE):
1. System detects `OLLAMA_BASE_URL` or local Ollama CLI presence and suggests enabling Ollama

**Plans:** 1/1 plans complete

Plans:
- [x] 04-01-PLAN.md — Zero-config Ollama detection and suggestion

---

### Phase 5: Polish & Edge Cases

**Goal:** UX refinements and edge case handling across the integration

**Depends on:** Phase 4

**Requirements:** (Distributed - edge cases handled within previous phases)

**Success Criteria** (what must be TRUE):
1. All Phase 1-4 success criteria continue to pass
2. No regressions in existing cloud provider functionality

**Plans:** 2/2 plans complete

Plans:
- [x] 05-01-PLAN.md — Edge case handling (empty models, missing context window, connection drops)
- [x] 05-02-PLAN.md — UX polish and regression verification

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Health Check | 3/3 | Complete | 2026-03-31 |
| 2. Core Chat Integration | 5/5 | Complete   | 2026-04-01 |
| 3. Tool Calling & Discovery | 4/5 | Complete    | 2026-04-01 |
| 4. Zero-Config Experience | 1/1 | Complete | 2026-04-01 |
| 5. Polish & Edge Cases | 2/2 | Complete | 2026-04-01 |

## Coverage

- **v1 requirements:** 22 total
- **Mapped to phases:** 22
- **Unmapped:** 0 ✓

---

*Roadmap created: 2026-03-31*
