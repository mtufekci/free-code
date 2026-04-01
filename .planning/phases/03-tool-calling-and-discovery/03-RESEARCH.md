# Phase 3: Tool Calling & Discovery - Research

**Researched:** 2026-04-01
**Domain:** Ollama tool calling API integration, model capability detection, graceful fallback
**Confidence:** HIGH

## Summary

Phase 3 enables tool calling for Ollama models that support it, with graceful fallback for models that don't. The Ollama API supports tool calls through the `tools` parameter in `/api/chat` requests and returns tool calls in the `message.tool_calls` field. The existing Ollama client in `src/services/api/ollama.ts` already has `tools` in its `MessageCreateParams` interface but the `translateRequestToOllama()` function does not forward tools to Ollama - this is the primary implementation gap. Tool responses need to be translated from Ollama's `tool_calls` format to Anthropic's streaming `input_json_delta` event format. Model capability detection via `supportsTools` flag in `extractContextWindow()` is already partially implemented but not yet integrated into the query flow.

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase. All decisions are open for research.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-01 | Tool call requests are formatted for Ollama's `tool_calls` API | Ollama `/api/chat` accepts `tools` array with `type: "function"` objects. Requires translation from Anthropic tool schema format. |
| TOOL-02 | Ollama tool call responses are translated to internal format | Ollama returns `message.tool_calls[].function.arguments` as JSON string. Needs streaming translation via `input_json_delta` events. |
| TOOL-03 | System detects when model does not support tools and falls back gracefully | `extractContextWindow()` already extracts `supportsTools` from `model_info.tools`. Need integration into query flow. |
| TOOL-04 | Tool calling is disabled for known-unsupported models with user-visible notice | Requires UI indicator when tools disabled, plus API-level suppression. |
| MODL-03 | Context window limits are respected to prevent silent truncation | Ollama's `num_ctx` option sets context size. Need to pass context window to `options.num_ctx` and detect `model_context_window_exceeded` errors. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing Ollama client | N/A | `src/services/api/ollama.ts` | Already implements SSE translation for streaming |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/utils/model/ollama.ts` | N/A | Model capability detection | Already extracts `supportsTools` from model info |
| `src/types/ollama.ts` | N/A | Type definitions | Already defines `OllamaTool`, `OllamaToolCall` types |

**No additional packages required** - Ollama tool calling uses existing HTTP fetch and SSE patterns already in the codebase.

## Architecture Patterns

### Pattern 1: Ollama Tool Request Translation

**What:** Translating Anthropic tool schemas to Ollama's `tools` array format

**When to use:** In `translateRequestToOllama()` before sending to Ollama

**Implementation approach:**
```typescript
// Ollama tool format (from api.md):
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get the weather...",
    "parameters": { /* JSON Schema */ }
  }
}

// Anthropic tool format in MessageCreateParams:
{
  name: string,
  description?: string,
  input: Record<string, unknown>  // JSON Schema
}
```

**Key difference:** Anthropic uses flat `{name, description, input}` while Ollama uses nested `{type: "function", function: {...}}`

### Pattern 2: Ollama Tool Response Streaming Translation

**What:** Translating Ollama's tool call response to Anthropic streaming format

**When to use:** In `translateEventToAnthropic()` when `event.message.tool_calls` is present

**Implementation approach:**
- Ollama sends complete `arguments` as a JSON string in one message
- Anthropic uses incremental `input_json_delta` events
- Need to parse arguments JSON and emit proper streaming events

```typescript
// Ollama response (done: true with tool_calls):
{
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [{
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\":\"Tokyo\"}"
      }
    }]
  },
  "done_reason": "tool"  // Key indicator
}

// Anthropic streaming format:
{ "type": "content_block_start", "index": 0, "content_block": { "type": "tool_use", "name": "get_weather", "input": "" }}
{ "type": "content_block_delta", "index": 0, "delta": { "type": "input_json_delta", "partial_json": "{\"city\":\"Tokyo\"}" }}
{ "type": "content_block_stop", "index": 0 }
```

### Pattern 3: Model Capability Detection

**What:** Detecting whether current Ollama model supports tool calling

**When to use:** Before including tools in requests

**Implementation approach:**
- Call `/api/show` endpoint with model name
- Extract `model_info.tools` boolean
- Cache result per model to avoid repeated API calls
- Fall back to `false` (safer) if API call fails

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Custom SSE parser | Existing `parseSSEStream()` in ollama.ts | Already handles `data: ` prefix and JSON parsing correctly |
| Tool schema translation | Custom format converter | Standard JSON Schema | Anthropic input is already JSON Schema compatible |
| Context window detection | Guess context size | Ollama `/api/show` `model_info.context_length` | Already implemented in `extractContextWindow()` |

**Key insight:** The existing Ollama client architecture with `translateRequestToOllama()` and `translateEventToAnthropic()` is the right pattern - just extend it for tools.

## Common Pitfalls

### Pitfall 1: Tool calls not stripped from unsupported models
**What goes wrong:** Model receives tools it can't handle, returns error or ignores them silently
**Why it happens:** No capability check before including `tools` in request
**How to avoid:** Check `supportsTools` flag before passing tools to Ollama, skip tools param entirely for unsupported models
**Warning signs:** Ollama returns 400 error or `done_reason: "stop"` without tool calls despite tools being sent

### Pitfall 2: Arguments JSON parsing errors
**What goes wrong:** Tool arguments come as malformed JSON string
**Why it happens:** Ollama may return arguments that aren't valid JSON
**How to avoid:** Wrap JSON.parse in try/catch, emit `content_block_stop` with partial input on parse failure
**Warning signs:** `JSON.parse` throws in tool response handling

### Pitfall 3: Context window truncation silent failure
**What goes wrong:** Requests exceed context window, Ollama truncates without warning
**Why it happens:** Not setting `options.num_ctx` and not checking response for truncation
**How to avoid:** 
1. Set `num_ctx` to model's known context window size
2. Check for `done_reason: "model_full"` 
3. Monitor for `model_context_window_exceeded` errors

### Pitfall 4: Inconsistent tool result format in follow-up requests
**What goes wrong:** After tool execution, follow-up Ollama request fails validation
**Why it happens:** Ollama expects `role: "tool"` with `tool_name` field, not `tool_call_id`
**How to avoid:** When building tool result messages for Ollama, use `tool_name` field (not `tool_call_id`)

## Code Examples

### Ollama Tool Request Format (verified from official docs)
```json
POST /api/chat
{
  "model": "llama3.2",
  "messages": [{"role": "user", "content": "what is the weather?"}],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather for a city",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string"}
          },
          "required": ["city"]
        }
      }
    }
  ],
  "stream": true
}
```

### Ollama Tool Response Format (verified from official docs)
```json
{
  "model": "llama3.2",
  "message": {
    "role": "assistant", 
    "content": "",
    "tool_calls": [{
      "function": {
        "name": "get_weather",
        "arguments": {"city": "Tokyo"}  // Note: arguments is object, not string, in some Ollama versions
      }
    }]
  },
  "done_reason": "tool",
  "done": true
}
```

### Tool Result Message Format for Ollama
```json
{
  "role": "tool",
  "content": "11 degrees celsius",
  "tool_name": "get_weather"  // Note: Ollama uses tool_name, not tool_call_id
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No tool calling | Ollama tool_calls API | Ollama v0.1+ | Full function calling support |
| Context length inference | Explicit `model_info.context_length` | Ollama API enhancement | Accurate context window detection |

**Deprecated/outdated:**
- Ollama `context` parameter (deprecated): Use `num_ctx` in options instead

## Open Questions

1. **Arguments format variation**
   - What we know: Ollama API docs show arguments as object `{"city": "Tokyo"}`, but type definition says `string`
   - What's unclear: Whether all Ollama versions return object vs string
   - Recommendation: Handle both cases - check if string or object and normalize

2. **Tool capability detection reliability**
   - What we know: `model_info.tools` boolean exists in Ollama API
   - What's unclear: Whether all Ollama models correctly report this field
   - Recommendation: Default to `supportsTools: false` if field missing, err on side of caution

3. **done_reason="tool" vs done_reason="stop"**
   - What we know: Ollama returns `done_reason: "tool"` when tool call is made
   - What's unclear: Whether we can rely on this for detecting tool calls vs checking for `tool_calls` presence
   - Recommendation: Check both - presence of `tool_calls` array is more reliable than `done_reason`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (existing project test setup) |
| Config file | `bunfig.toml` |
| Quick run command | `bun test` |
| Full suite command | `bun test --reporter=verbose` |
| Estimated runtime | ~30-60 seconds |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|------------------|--------------|
| TOOL-01 | Tool schemas translated to Ollama format | Unit | `bun test src/services/api/ollama.test.ts` | ❌ Wave 0 gap |
| TOOL-02 | Tool call responses translated correctly | Unit | `bun test src/services/api/ollama.test.ts` | ❌ Wave 0 gap |
| TOOL-03 | Unsupported models skip tools gracefully | Integration | `bun test src/utils/model/ollama.test.ts` | ❌ Wave 0 gap |
| TOOL-04 | User-visible notice when tools disabled | Manual | N/A | Manual verification |
| MODL-03 | Context window respected | Integration | `bun test src/services/api/ollama.test.ts` | ❌ Wave 0 gap |

### Wave 0 Gaps (must be created before implementation)
- `src/services/api/ollama.test.ts` — test file for Ollama client tool calling translation
- `src/utils/model/ollama.test.ts` — test file for model capability detection

## Sources

### Primary (HIGH confidence)
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md) - Verified `/api/chat` tool calling format, response structure
- `src/services/api/ollama.ts` - Existing Ollama client implementation (lines 1-470)
- `src/types/ollama.ts` - Ollama type definitions including `OllamaTool`, `OllamaToolCall`
- `src/utils/model/ollama.ts` - Model info extraction including `extractContextWindow()`

### Secondary (MEDIUM confidence)
- [Ollama Tool Calling Blog](https://ollama.com/search?c=tool) - Confirms tool calling is model-dependent feature

### Tertiary (LOW confidence)
- Tool argument parsing behavior across Ollama versions — needs runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing codebase patterns and Ollama API
- Architecture: HIGH - Extension of existing translateRequestToOllama pattern
- Pitfalls: MEDIUM - Ollama API behavior documented, some edge cases need runtime verification

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (Ollama API stable, codebase patterns established)
