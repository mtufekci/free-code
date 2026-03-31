# Phase 2 Research: Ollama as Full API Provider

## Context

Phase 2 goal: User can conduct full conversations with Ollama models via streaming REPL.  
Requirements: CHAT-01, CHAT-02, CHAT-03, CHAT-04, MODL-01, MODL-02, MODL-04.

**Phase 1 already provides:**
- `isOllamaEnabled()` - env var check
- `getOllamaBaseURL()` - defaults to `http://localhost:11434`
- `getOllamaModel()` - defaults to `minimax-m2.7:cloud`
- `checkOllamaConnection()` - TCP reachability check
- `formatOllamaConnectionError()` - (referenced but not in Phase 1 helpers)

---

## 1. How API Client Creation Works

**`getAnthropicClient()`** (`src/services/api/client.ts:88-316`):

```
getAnthropicClient() → creates provider-specific client (Anthropic, Bedrock, Vertex, Foundry)
  ↓
  - Bedrock: uses @anthropic-ai/bedrock-sdk
  - Vertex: uses @anthropic-ai/vertex-sdk  
  - Foundry: uses @anthropic-ai/foundry-sdk
  - Default: uses @anthropic-ai/sdk (Anthropic)
```

Key pattern: The function checks env vars (`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`, `CLAUDE_CODE_USE_OLLAMA`) to determine which client to instantiate.

**What Ollama needs:** A new `getOllamaClient()` function that creates an Ollama-compatible API client. Since Ollama uses the OpenAI-compatible `/api/chat` endpoint, we could either:

1. Use an OpenAI-compatible client library pointing to Ollama's base URL
2. Create a minimal client using native `fetch` that wraps Ollama's API

---

## 2. Where API Calls Are Made

**Streaming call site** (`src/services/api/claude.ts:1822-1831`):

```typescript
const result = await anthropic.beta.messages
  .create(
    { ...params, stream: true },
    { signal, ...(clientRequestId && { headers: { [CLIENT_REQUEST_ID_HEADER]: clientRequestId } }) }
  )
  .withResponse()
```

**Non-streaming fallback** (`src/services/api/claude.ts:864-873`):

```typescript
return await anthropic.beta.messages.create(
  { ...adjustedParams, model: normalizeModelStringForAPI(adjustedParams.model) },
  { signal, timeout: fallbackTimeoutMs }
)
```

The entire API interaction is encapsulated in `queryModel()` generator in `claude.ts`. This is the **single choke point** for all LLM API calls in the codebase.

---

## 3. How Streaming Works

The streaming architecture:

```
SDK Stream (BetaRawMessageStreamEvent)
  ↓
for await (const part of stream) { ... }
  ↓
switch(part.type) {
  case 'message_start':      → partialMessage, ttftMs, usage
  case 'content_block_start': → initialize content block
  case 'content_block_delta': → accumulate text/tool input
  case 'content_block_stop':  → yield AssistantMessage
  case 'message_delta':      → update usage, stop_reason
  case 'message_stop':        → cleanup
}
  ↓
yield { type: 'stream_event', event: part, ...(ttftMs) }
```

**Key insight:** The stream yields `BetaRawMessageStreamEvent` types from the Anthropic SDK. These are then wrapped as `StreamEvent` (a thin wrapper with `type: 'stream_event'`).

---

## 4. Ollama `/api/chat` API Format

Ollama's Chat API (`/api/chat`) uses this format:

**Request:**
```json
{
  "model": "minimax-m2.7:cloud",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": true,
  "options": {
    "temperature": 1,
    "num_predict": 4096
  }
}
```

**Streaming Response (SSE):**
```
data: {"model":"minimax-m2.7:cloud","created_at":"...","message":{"role":"assistant","content":"Hi"},"done":false}
data: {"model":"minimax-m2.7:cloud","created_at":"...","message":{"role":"assistant","content":" there"},"done":false}
data: {"model":"minimax-m2.7:cloud","created_at":"...","message":{"role":"assistant","content":"!","tool_calls":[...],"done":true}
```

Each SSE line is `data: {...}` followed by `\n\n`.

**Critical differences from Anthropic:**

| Aspect | Anthropic | Ollama |
|--------|-----------|--------|
| Auth | API key/Bearer token | No auth (local) |
| Endpoint | `/v1/messages` | `/api/chat` |
| Streaming | Server-Sent Events | SSE with `data:` prefix |
| Model param | In body | In body |
| Message format | `role` + `content` | Same |
| Tool calls | `tool_use` blocks | `tool_calls` array in message |
| Stop reason | `stop_reason` field | `done_reason` field |
| Usage stats | `usage` object | Not provided by Ollama |

---

## 5. Required Adapter/Translation Layer

### A. Client-Level Adapter

Create `src/services/api/ollama.ts` that provides a client mimicking the Anthropic SDK interface but calling Ollama's API:

```
getOllamaClient() → returns object with .beta.messages.create() method
```

The client must:
- Accept same parameters as Anthropic client
- Return same streaming interface (`Stream<BetaRawMessageStreamEvent>`)
- Translate Ollama SSE events → Anthropic `BetaRawMessageStreamEvent` format

### B. Event Translation (Ollama → Anthropic)

**Ollama event → Anthropic event mapping:**

| Ollama | Anthropic |
|--------|-----------|
| (first chunk) | `message_start` |
| `message.content` delta | `content_block_delta` (type: `text_delta`) |
| `message.tool_calls` | `content_block_start` (type: `tool_use`) + `content_block_delta` (type: `input_json_delta`) |
| `done: true` | `message_delta` + `message_stop` |

**Minimal translation needed:**

```typescript
// Ollama's SSE parsing → BetaRawMessageStreamEvent
function translateOllamaToAnthropic(ollamaEvent: OllamaChatEvent): BetaRawMessageStreamEvent {
  switch (ollamaEvent.type) {
    case 'message':
      return {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ollamaEvent.message.content }
      }
    case 'tool_calls':
      // Map tool calls to tool_use blocks
    case 'done':
      return { type: 'message_stop' }
  }
}
```

### C. Request Translation (Anthropic → Ollama)

**`normalizeModelStringForAPI()`** may need Ollama-specific handling since Ollama model strings are different (e.g., `minimax-m2.7:cloud` vs `claude-3-5-sonnet-20241022`).

**`paramsFromContext`** builds the request body. For Ollama, we need to transform:
- Remove Anthropic-specific params (`betas`, `thinking`, `output_config`, etc.)
- Map `max_tokens` → `options.num_predict`
- Map `temperature` → `options.temperature`
- Handle system prompt (Ollama uses `messages` with a `system` role)

---

## 6. Key Files That MUST Be Modified

### Must Modify:

1. **`src/utils/model/providers.ts`**
   - Already has `getAPIProvider()` returning `'ollama'` when `CLAUDE_CODE_USE_OLLAMA` is set
   - May need: Ollama-specific provider checks

2. **`src/services/api/client.ts`**
   - Add `getOllamaClient()` function
   - Or create separate `src/services/api/ollama.ts` for Ollama-specific client
   - Integrate into `getAnthropicClient()` or create parallel `getClient()` that routes based on provider

3. **`src/services/api/claude.ts`** (likely minimal changes)
   - The `queryModel()` generator is provider-agnostic at the stream level
   - Key question: Does `withRetry()` work with Ollama client? Likely yes if client interface is compatible
   - May need to disable certain features (thinking, prompt caching) for Ollama

4. **`src/utils/model/ollama.ts`**
   - Phase 1 already has helpers
   - May need: model normalization, error formatting

### May Need to Create:

5. **`src/services/api/ollama.ts`** (new file)
   - `createOllamaClient()` - creates fetch-based Ollama API client
   - `translateOllamaStream()` - SSE parsing and event translation
   - `translateRequestToOllama()` - Anthropic params → Ollama params

6. **`src/types/ollama.ts`** (new file)
   - TypeScript types for Ollama API requests/responses

---

## Ollama Compatibility Considerations

### What Works Natively:
- Basic chat with streaming
- System prompts (via `role: 'system'` message)
- Tool calls (Ollama 0.1.38+ supports function calling)

### Requires Feature Flags/Disabling:
- **Prompt caching** - Not supported by Ollama, must disable
- **Thinking/Extended thinking** - Not supported, disable
- **Beta headers** - Not needed for Ollama
- **Fast mode** - Not applicable
- **Structured outputs** - Limited support

### Not Supported by Ollama:
- Usage/token tracking (no `cache_read_input_tokens`, etc.)
- Multi-turn context caching
- Custom metadata

---

## Validation Architecture

### Unit Tests

**1. Request Translation Tests** (`src/services/api/ollama.test.ts`):
```
GIVEN an Anthropic-formatted request
WHEN translated to Ollama format  
THEN it matches Ollama /api/chat schema
```

**2. Response Translation Tests**:
```
GIVEN Ollama SSE streaming events
WHEN translated to BetaRawMessageStreamEvent
THEN the stream yields correct event types in correct order
```

**3. Integration Tests with Mock Ollama Server**:
```
GIVEN a mock Ollama server running locally
WHEN queryModel() is called with ollama provider
THEN streaming responses are yielded correctly
AND assistant messages are properly formed
```

### Manual Validation

**1. Start Ollama server:**
```bash
ollama serve  # in one terminal
ollama list   # verify model available
```

**2. Set environment:**
```bash
export CLAUDE_CODE_USE_OLLAMA=1
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=minimax-m2.7:cloud  # or your model
```

**3. Run CLI in debug mode:**
```bash
claude --debug  # or CLAUDE_CODE_DEBUG=1
> Hello, how are you?
```

**4. Debug indicators to check:**
- `[API REQUEST]` log shows `/api/chat` endpoint
- Streaming chunks arrive (TTFT measured)
- Tool calls work if model supports them
- `^C` (Ctrl+C) aborts stream properly

### Test Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Basic chat | Stream text, complete response |
| Multi-turn conversation | Context maintained across turns |
| Tool use | Model returns tool_call, tool executed, result returned |
| Long response | Stream completes without truncation |
| Stream abort (Ctrl+C) | Stream stops cleanly, no hang |
| Ollama server offline | Clear error message, not a hang |
| Invalid model | Error before API call |
| System prompt | Applied correctly |
