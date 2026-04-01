# Requirements: Add Ollama Support

**Defined:** 2026-03-31
**Core Value:** Users can run a full-featured AI coding assistant entirely offline using Ollama as the model provider.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Provider Configuration

- [x] **PROV-01**: User can enable Ollama by setting `CLAUDE_CODE_USE_OLLAMA=true`
- [x] **PROV-02**: User can configure Ollama base URL via `OLLAMA_BASE_URL` env var (defaults to `http://localhost:11434`)
- [x] **PROV-03**: User can configure Ollama model via `OLLAMA_MODEL` env var (defaults to auto-detected)
- [ ] **PROV-04**: System detects `OLLAMA_BASE_URL` or local Ollama CLI presence and suggests enabling Ollama

### Connection & Health

- [x] **CONN-01**: System performs Ollama health check on startup when enabled
- [x] **CONN-02**: System warns and continues if Ollama endpoint is unreachable (with fallback to cloud)
- [x] **CONN-03**: System validates Ollama API version compatibility on connect

### Chat Completions

- [ ] **CHAT-01**: User can send prompts and receive responses from Ollama models
- [ ] **CHAT-02**: Streaming responses render correctly in the terminal REPL
- [ ] **CHAT-03**: Ollama response format is translated to match expected internal event shape
- [ ] **CHAT-04**: Connection handles Ollama keep-alive and session persistence

### Tool Calling ( Ollama Models That Support It)

- [x] **TOOL-01**: Tool call requests are formatted for Ollama's `tool_calls` API
- [x] **TOOL-02**: Ollama tool call responses are translated to internal format
- [x] **TOOL-03**: System detects when model does not support tools and falls back gracefully
- [ ] **TOOL-04**: Tool calling is disabled for known-unsupported models with user-visible notice

### Model Discovery

- [ ] **MODL-01**: System can list available Ollama models via `/api/tags`
- [ ] **MODL-02**: System detects model context window size from Ollama API
- [x] **MODL-03**: Context window limits are respected to prevent silent truncation
- [x] **MODL-04**: User can see which model is active and its capabilities in the REPL

### Error Handling

- [x] **ERR-01**: Ollama connection errors show actionable messages (not raw API errors)
- [x] **ERR-02**: Ollama timeout and rate-limit errors are handled gracefully
- [x] **ERR-03**: System can fall back to cloud provider if Ollama is unavailable (when both are configured)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced

- **ADV-01**: Support for Ollama Cloud hosted models (`https://api.ollama.com`)
- **ADV-02**: Automatic local Ollama discovery on the network
- **ADV-03**: Model recommendations based on task type (coding vs general)
- **ADV-04**: Support for Ollama's "thinking" mode (if available in API)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Ollama model management (pull, delete, inspect) | Use `ollama` CLI directly |
| Non-CLI modes (bridge, daemon, remote) | Focus on core CLI first |
| Custom Ollama API extensions | Standard OpenAI-compatible API only |
| Ollama-specific prompt templates | Use existing Claude prompt engineering |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | Phase 1 | Complete |
| PROV-02 | Phase 1 | Complete |
| PROV-03 | Phase 1 | Complete |
| PROV-04 | Phase 4 | Pending |
| CONN-01 | Phase 1 | Complete |
| CONN-02 | Phase 1 | Partial - plan specifies warn-and-continue (not fail-fast) |
| CONN-03 | Phase 1 | Complete |
| CHAT-01 | Phase 2 | Pending |
| CHAT-02 | Phase 2 | Pending |
| CHAT-03 | Phase 2 | Pending |
| CHAT-04 | Phase 2 | Pending |
| TOOL-01 | Phase 3 | Pending |
| TOOL-02 | Phase 3 | Complete |
| TOOL-03 | Phase 3 | Complete |
| TOOL-04 | Phase 3 | Pending |
| MODL-01 | Phase 2 | Pending |
| MODL-02 | Phase 2 | Pending |
| MODL-03 | Phase 3 | Complete |
| MODL-04 | Phase 2 | Complete |
| ERR-01 | Phase 1 | Complete |
| ERR-02 | Phase 1 | Complete |
| ERR-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after auto-initialization*
