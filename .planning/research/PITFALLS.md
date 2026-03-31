# Pitfalls Research: Adding Ollama as a Model Provider

**Domain:** Local AI coding assistant with OpenAI-compatible model provider integration
**Researched:** 2026-03-31
**Confidence:** MEDIUM-HIGH

## Critical Pitfalls

### Pitfall 1: Endpoint and Auth Model Mismatch

**What goes wrong:**
You treat Ollama like a cloud provider (env var toggle → new provider branch → full client path) when it actually uses the OpenAI-compatible endpoint pattern with no auth.

**Why it happens:**
The existing codebase has three cloud provider patterns (Bedrock, Vertex, Foundry), each with dedicated client constructors and separate code paths gated by `CLAUDE_CODE_USE_*`. Ollama is not a cloud provider — it is a local process that exposes an OpenAI-compatible REST API at `http://localhost:11434` (or a cloud mirror). It has no API key, no auth headers, no AWS SIGV4, no OAuth.

**How to avoid:**
Do NOT create a new `ollama` provider variant. Instead, treat Ollama as a configurable base URL override on the existing OpenAI-compatible path. The Ollama integration lives in the base URL / custom headers layer, not in the provider branching layer. A `CLAUDE_CODE_USE_OLLAMA=1` or `OLLAMA_BASE_URL` env var that sets `ANTHROPIC_BASE_URL` (or a new `OLLAMA_BASE_URL`) is sufficient to route existing first-party code to Ollama, provided streaming and response shape are compatible.

**Warning signs:**
- You are adding `ollama` to the `APIProvider` type union in `providers.ts`
- You are adding new client constructors or auth headers for Ollama
- You are adding `CLAUDE_CODE_USE_OLLAMA` alongside `CLAUDE_CODE_USE_BEDROCK` in env-constant allowlists

**Phase to address:** Integration phase — should be caught in design review before code is written

---

### Pitfall 2: Model Loading and Keep-Alive Exhaustion

**What goes wrong:**
Every Ollama chat request loads the model into memory, response finishes, model unloads, next request reloads. Latency is 5-30 seconds per turn instead of near-instant.

**Why it happens:**
Ollama has a `keep_alive` parameter (default: `5m`) controlling how long a model stays loaded. If you send single requests without managing this, the model reloads on every turn. For an interactive CLI, this destroys responsiveness.

**How to avoid:**
Set `keep_alive` to a long duration (e.g., `24h` or a very large value) on chat requests. Add a background polling mechanism (e.g., every 30s) that sends a minimal ping to the Ollama `/api/tags` or chat endpoint to keep the model loaded. Document this for users or make it automatic when Ollama is detected.

**Warning signs:**
- You are not configuring `keep_alive` in chat request bodies
- No background keepalive mechanism exists
- Latency tests show multi-second delays on every turn after the first

**Phase to address:** Integration phase — basic Ollama support without this is nearly unusable

---

### Pitfall 3: Streaming Response Shape Incompatibility

**What goes wrong:**
The streaming response parser expects Anthropic SSE (Server-Sent Events) format, but Ollama uses a different streaming JSON format. Tool calls, stop reasons, and message boundaries are all different shapes.

**Why it happens:**
Claude Code's streaming pipeline is built around Anthropic's `text/event-stream` format with `data: {...}` blocks and specific fields (`type`, `content_block`, `delta`, etc.). Ollama streams plain JSON objects per token with `message.content` and `done` fields.

**How to avoid:**
Build a translation layer between Ollama's streaming format and the internal event shape the existing `src/services/api/claude.ts` streaming consumer expects. The layer should:
- Map Ollama's `message.content` deltas → internal `text` delta events
- Map Ollama's `done_reason` → stop reason mapping
- Handle Ollama tool-call streaming (tool calls come as part of the message, not as separate events)
- Test with streaming enabled before claiming streaming works

**Warning signs:**
- You are using the same streaming parser for Ollama as for Anthropic without a transformation step
- Tool calls work with cloud providers but fail silently with Ollama
- You see malformed events or undefined field errors in streaming output

**Phase to address:** Integration phase — streaming is a core UX feature

---

### Pitfall 4: Tool Calling Capability Assumption

**What goes wrong:**
You assume all Ollama models support tool calling because the API supports it, but most local models (especially quantised ones) do not support tool calling or produce unreliable tool call JSON.

**Why it happens:**
Ollama's API supports a `tools` parameter, but whether the underlying model actually respects it depends entirely on the model. llama3.2 ( instruct) has mixed tool support; many fine-tunes do not. The API will accept the tools parameter and return whatever the model generates, which may be malformed or ignore tools entirely.

**How to avoid:**
Detect model capabilities at startup (via `/api/tags` and `/api/show`) and fall back gracefully when tool calling is not supported. Do not assume that because `tools` can be sent, `tool_calls` will be returned. Implement structured output validation on responses and have a non-tool-call fallback path. Add a clear user-visible message when the selected model does not support tools.

**Warning signs:**
- You are passing tools to all models without checking capability
- No fallback to non-tool-call mode when model produces invalid JSON for tool calls
- Users report "model ignores tools" without any feedback

**Phase to address:** Integration phase — tool calling is core to the CLI use case

---

### Pitfall 5: Context Window Assumption

**What goes wrong:**
You assume Ollama models have the same context window as cloud models (200k+ tokens for Claude). Many Ollama models have 4k, 8k, or 32k context windows. Sending a large conversation history to a 4k-context model causes truncation or silent failure.

**Why it happens:**
The codebase manages context with compaction and budget logic based on Claude's context capacities. Ollama models vary wildly in context size. The compaction thresholds tuned for Claude are wrong for 4k models.

**How to avoid:**
Query the model's context window at connection time (Ollama's `/api/show` endpoint returns `context_length`). Use this to drive compaction thresholds, user-facing context warnings, and session management. Default to conservative limits if context size cannot be determined.

**Warning signs:**
- No context size detection on Ollama connection
- Compaction triggers at token counts designed for 200k context
- Users with small-context models see truncated responses with no explanation

**Phase to address:** Integration phase — broken context handling makes long conversations unusable

---

### Pitfall 6: Connection Liveness and Health Checks

**What goes wrong:**
The CLI starts up, Ollama is not running, and the error is cryptic or the CLI hangs indefinitely instead of failing fast with a clear "Ollama is not running" message.

**Why it happens:**
Without an explicit Ollama health check at startup, the CLI tries to use Ollama as a provider and fails on the first API call with a generic network error. There is no `ollama status` command or startup probe.

**How to avoid:**
On startup (or when Ollama is configured), perform a health check against `http://localhost:11434/api/tags` or the configured base URL. Verify the requested model is available. Fail fast with a user-friendly message that tells the user to start Ollama or pull the model. Add an `ollama status` command that reports connection state and available models.

**Warning signs:**
- No health check on startup when Ollama is configured
- Generic fetch/connection errors visible to users
- No `ollama` subcommand or status command

**Phase to address:** Integration phase — users will hit this on first run

---

### Pitfall 7: Silent Fallthrough to Cloud Provider

**What goes wrong:**
Ollama is configured but not reachable, so the system silently falls back to the default cloud provider without telling the user.

**Why it happens:**
If the Ollama connection fails and there is no explicit error or provider guard, the code path falls through to the default `firstParty` provider. The user thinks they are using their local model but is actually hitting the cloud API (and potentially spending money or sending data externally).

**How to avoid:**
When Ollama is explicitly configured (env var is set or base URL is non-default), require it to be reachable at startup. Do not silently fall through to cloud. Surface an explicit error: "Ollama is configured but not reachable at `http://...`. Start Ollama or unset OLLAMA_BASE_URL to use cloud."

**Warning signs:**
- No error when Ollama is configured but unreachable
- Requests go to cloud API when Ollama was intended
- No user-visible indicator of which provider is active

**Phase to address:** Integration phase — this is a trust and privacy issue

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip model capability detection at startup | Faster integration | Broken tool calling, wrong context limits | Never for MVP |
| Hard-code `keep_alive` without background ping | Simpler code | Model unloads, slow subsequent requests | Never |
| Use same streaming parser without translation | Code reuse | Malformed events, broken tool calls | Never |
| Skip health check on startup | Simpler flow | Cryptic errors, silent cloud fallback | Never |
| Assume all Ollama endpoints return same shape as Anthropic | Less code | Hard to debug at runtime | Never |
| Skip model-list validation | Faster to ship | User selects unavailable model, gets confusing error | Only for advanced/config-only |

---

## Integration Gotchas

| Ollama API | Common Mistake | Correct Approach |
|------------|----------------|------------------|
| `/api/chat` streaming | Treating Ollama SSE as Anthropic SSE | Build a translation layer; Ollama streams plain JSON lines |
| `keep_alive` param | Not setting it or setting it too low | Set to `24h` and implement background keepalive ping |
| `/api/tags` | Not checking if model is available before use | Probe available models on startup; surface clear errors |
| Tool calling via `tools` param | Sending to all models regardless of capability | Query `/api/show` for model capabilities; fallback gracefully |
| Context window | Assuming 200k+ like Claude models | Query `/api/show` for `context_length`; adjust compaction |
| Base URL configuration | Hard-coding `localhost:11434` | Allow `OLLAMA_BASE_URL` env var for cloud Ollama instances |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Model not kept warm | 5-30s latency on every turn | Set `keep_alive` + background ping | Every interaction after first |
| Large history sent to small context model | Truncated context, confused model | Detect context window; warn or truncate proactively | After ~3-4 turns |
| Pulling model on first use | Long wait with no feedback | Document `ollama pull` requirement; add pre-flight model check | First-time users |
| No request timeout | CLI hangs on slow/unresponsive Ollama | Set explicit fetch timeout (e.g., 60s); surface timeout errors | On slow hardware or large outputs |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Routing data to external Ollama cloud without user awareness | Privacy bypass if user thinks local = local | Require explicit URL config for non-localbase URL; warn when data leaves localhost |
| No TLS verification for local HTTP | MITM on localhost possible but low risk | For localhost:11434, skip; for cloud Ollama, require HTTPS |
| Shell injection in model name | Malicious model name could affect system | Validate/sanitize model names from config before passing to Ollama API |
| Storing Ollama API key if cloud used | Credentials in plaintext config | If cloud Ollama uses an API key, store in secure storage (same as other providers) |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No "which model am I using" indicator | Users unsure if local or cloud | Show model name + provider in REPL prompt/status |
| Cryptic Ollama not-running error | New users give up immediately | Detect and surface "Start Ollama: `ollama serve`" message |
| Tool calling silently fails on incapable model | User thinks CLI is broken | Clear message: "Model X does not support tool calling — try a different model" |
| Large context silently truncated | User loses conversation history | Warn when history approaches model context limit |
| No way to switch models without restarting | Friction for model comparison | `ollama set-model <name>` or env-var hot-reload |

---

## "Looks Done But Isn't" Checklist

- [ ] **Streaming:** Ollama streaming appears to work but deltas are not mapped correctly — verify tool call streaming works end-to-end
- [ ] **Tool calling:** Tools are sent and JSON is returned, but the parsing layer drops tool calls — verify the full tool-call round-trip with actual function execution
- [ ] **Context management:** Context window detection runs but result is never used to adjust compaction thresholds — verify large histories are truncated gracefully
- [ ] **Model availability:** `ollama list` shows the model but Ollama must load it first on first request — verify user gets feedback during the load delay
- [ ] **Health check:** Health check passes but the specific requested model is not available — verify model-by-model availability, not just server reachability
- [ ] **Provider routing:** When `OLLAMA_BASE_URL` is set, verify requests actually go to Ollama and not the default cloud provider

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Model not warm | MEDIUM | User sends a minimal request to warm up; CLI auto-pings in background |
| Tool call format wrong | MEDIUM | Parse attempt → fallback to text response with warning |
| Context overflow | LOW | Automatic compaction kicks in; user sees "context summarised" notice |
| Silent cloud fallback | HIGH | Detect unreachable Ollama at startup; block startup until resolved or user explicitly opts out |
| Model not available | LOW | Surface clear error: "Model 'foo' not found. Run `ollama pull foo` first." |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Endpoint and auth model mismatch | Design / Architecture | Provider pattern review — Ollama should not be a new provider variant |
| Model loading / keep-alive | Integration | Measure latency on 2nd, 3rd, 4th turn — should be <1s |
| Streaming shape incompatibility | Integration | Run a full tool-call conversation with streaming enabled |
| Tool calling capability | Integration | Test with a known incapable model (e.g., small quantised models) |
| Context window mismatch | Integration | Load a long conversation and verify the model responds coherently |
| No health check | Integration | Kill Ollama mid-session — should see clean error, not hang |
| Silent cloud fallback | Integration | Set wrong Ollama URL — should error immediately, not silently route elsewhere |

---

## Sources

- Ollama API documentation (GitHub `ollama/ollama/docs/api.md`) — confirmed OpenAI-compatible chat format, streaming format, tool calling support, and `/api/show` model info endpoint
- Existing provider pattern in `src/utils/model/providers.ts` — confirmed Bedrock/Vertex/Foundry are separate branches, Ollama should not follow this pattern
- Existing streaming consumers in `src/services/api/claude.ts` — confirmed streaming pipeline expects Anthropic event shape
- `src/services/api/client.ts` — confirmed base URL and auth header layering as the correct integration point

---

*Pitfalls research for: Adding Ollama as a Model Provider*
*Researched: 2026-03-31*
