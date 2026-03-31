# Feature Research

**Domain:** Ollama Model Provider Integration
**Researched:** 2026-03-31
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Provider toggle via env var | Existing pattern (CLAUDE_CODE_USE_BEDROCK, etc.) | LOW | Add CLAUDE_CODE_USE_OLLAMA flag |
| OpenAI-compatible API client | Ollama exposes OpenAI-compatible /v1/chat/completions | LOW | New provider variant, same interface |
| Local instance detection | Ollama runs locally by default on localhost:11434 | LOW | Auto-detect if Ollama is running |
| Cloud endpoint support | Ollama Cloud (api.ollama.com) for remote models | LOW | Base URL config via env var |
| Basic prompt → response cycle | Core use case — chat works with local models | LOW | Standard chat completions API |
| Model selection | Users choose which Ollama model to use | MEDIUM | Map model names, respect Ollama model list |
| Connection health check | Verify Ollama is reachable before use | LOW | Ping endpoint on startup |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Automatic local Ollama discovery | Zero-config experience — if Ollama runs, it just works | MEDIUM | Check localhost:11434, try to fetch model list |
| Tool call support with Ollama models | Full Claude-level coding assistance on local models | HIGH | Ollama supports function calling in newer versions; requires testing against supported models |
| Dynamic model list from Ollama | Show available models without manual config | LOW | GET /api/tags returns model list |
| Model recommendation for coding | Suggest best-coding models from available Ollama models | MEDIUM | Parse model names, suggest deepseek-coder, codellama, etc. |
| Offline-first experience | Use the CLI without internet for coding tasks | LOW | Primary value prop — ensure this works reliably |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Ollama model management (pull, delete, install) | "Manage everything in one place" appeal | Scope creep; Ollama CLI is the right tool | Keep model management in ollama CLI |
| Custom Ollama API extensions | Want more control over Ollama settings | Fragile; breaks on Ollama updates | Use standard OpenAI-compatible API |
| Streaming response customization | "Tune how streaming works" | Complexity without user value for CLI | Use sensible defaults |
| Ollama in non-CLI modes (daemon, bridge) | Future extensibility | YAGNI; adds infrastructure complexity | CLI-only for v1 |

## Feature Dependencies

```
[Provider Toggle (CLAUDE_CODE_USE_OLLAMA)]
    └──requires──> [API Client Implementation]
                        └──requires──> [Health Check]
                                        
[Tool Call Support]
    └──requires──> [API Client Implementation]
    └──requires──> [Ollama Version Detection] ──> [Feature Detection]
    
[Automatic Discovery]
    └──requires──> [Health Check]
    └──enhances──> [Local Instance Detection]
```

### Dependency Notes

- **Provider toggle requires API client:** The `CLAUDE_CODE_USE_OLLAMA` env var must gate a new API client implementation
- **Tool calls require API client + Ollama version detection:** Tool calling support depends on Ollama's function calling capability which varies by version and model
- **Automatic discovery enhances local detection:** Rather than requiring explicit configuration, we try to connect to localhost:11434 automatically

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] **Provider toggle** — `CLAUDE_CODE_USE_OLLAMA=1` flag that routes to Ollama endpoint
- [ ] **API client** — OpenAI-compatible client targeting Ollama's /v1/chat/completions
- [ ] **Local connection** — Connect to localhost:11434 by default
- [ ] **Cloud connection** — Configurable base URL for Ollama Cloud (env var)
- [ ] **Health check** — Verify Ollama is reachable before attempting requests

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Model list endpoint** — Fetch available models from Ollama to populate model selection
- [ ] **Tool call support** — Enable function calling if Ollama version supports it
- [ ] **Model recommendation** — Suggest appropriate coding models from available list

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Streaming output customization** — User control over how streaming responses render
- [ ] **Non-CLI modes** — Daemon or bridge mode for Ollama integration
- [ ] **Ollama settings sync** — Persist user preferences for Ollama-specific options

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Provider toggle | HIGH | LOW | P1 |
| API client (OpenAI-compatible) | HIGH | LOW | P1 |
| Local instance connection | HIGH | LOW | P1 |
| Cloud endpoint support | MEDIUM | LOW | P1 |
| Health check | HIGH | LOW | P1 |
| Model list from Ollama | MEDIUM | LOW | P2 |
| Tool call support | HIGH | HIGH | P2 |
| Automatic discovery | MEDIUM | MEDIUM | P2 |
| Model recommendation | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Claude Code (cloud) | Continue (Ollama) | Our Approach |
|---------|---------------------|-------------------|--------------|
| Local model support | No | Yes | Ollama as local provider |
| Tool calling | Yes (Anthropic tools) | Limited | Detect Ollama capability, enable if supported |
| Model selection | Fixed models | Any Ollama model | Map Ollama models, suggest coding-optimized |
| Zero-config setup | API key required | Ollama must run | Auto-detect local Ollama instance |
| Offline mode | No | Yes | Primary differentiator |

## Sources

- [Ollama API documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [OpenAI-compatible API endpoints](https://github.com/ollama/ollama/blob/main/docs/openai.md)
- [Existing provider implementations (Bedrock, Vertex, Foundry)](src/services/api/client.ts)
- [Project constraints and scope](.planning/PROJECT.md)

---
*Feature research for: Ollama model provider integration*
*Researched: 2026-03-31*
