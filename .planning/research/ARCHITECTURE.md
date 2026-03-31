# Architecture Research: Ollama Integration

**Domain:** CLI Coding Assistant with Local Model Provider
**Researched:** 2026-03-31
**Confidence:** HIGH

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI Entry Point                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    UI Layer (React/Ink)                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                  Service Layer (API Client)                       │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │ │
│  │  │  Bedrock SDK  │  │  Foundry SDK  │  │   Vertex SDK  │        │ │
│  │  └───────────────┘  └───────────────┘  └───────────────┘        │ │
│  │  ┌───────────────┐                                             │ │
│  │  │  Ollama SDK   │  ← NEW                                      │ │
│  │  └───────────────┘                                             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │              Core API Abstraction (getAnthropicClient)          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Ollama    │  │   Bedrock   │  │   Vertex    │   External      │
│  │  (localhost │  │    (AWS)    │  │    (GCP)    │   Providers     │
│  │   or cloud) │  │             │  │             │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| `src/utils/model/providers.ts` | Provider detection (env var toggle) | Add `ollama` to `APIProvider` type and `getAPIProvider()` |
| `src/services/api/client.ts` | Unified client factory | Add Ollama branch in `getAnthropicClient()` |
| `src/services/api/ollamaClient.ts` | Ollama-specific configuration | NEW - Base URL, auth, timeout config |
| Tool orchestration | Handle Ollama tool call format | Adapt existing tool call adapters |
| Model selection | Map model names for Ollama | NEW - Model name translation layer |

### Data Flow

```
User Input → React/Ink UI
    ↓
Service Layer (client.ts)
    ↓
[Provider Detection via CLAUDE_CODE_USE_OLLAMA]
    ↓
┌─────────────────────────────────────────┐
│         if CLAUDE_CODE_USE_OLLAMA       │
│  ┌───────────────────────────────────┐ │
│  │    Ollama SDK Client              │ │
│  │    - host: localhost:11434        │ │
│  │    - or: ollama.com/api           │ │
│  │    - auth: OLLAMA_API_KEY (cloud) │ │
│  └───────────────────────────────────┘ │
│                    ↓                   │
│            /api/chat endpoint          │
└─────────────────────────────────────────┘
    ↓
Streaming Response → UI Updates
```

### Existing Provider Pattern (Reference)

From `src/services/api/client.ts` lines 153-297:

```typescript
// Each provider follows this pattern:
if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) {
  const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk')
  // Configure region, auth, args
  return new AnthropicBedrock(bedrockArgs) as unknown as Anthropic
}

if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
  const { AnthropicFoundry } = await import('@anthropic-ai/foundry-sdk')
  // Configure Azure AD, args
  return new AnthropicFoundry(foundryArgs) as unknown as Anthropic
}

if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) {
  const { AnthropicVertex } = await import('@anthropic-ai/vertex-sdk')
  // Configure Google Auth, region, args
  return new AnthropicVertex(vertexArgs) as unknown as Anthropic
}
```

## Ollama-Specific Architecture

### Two Deployment Modes

| Mode | Base URL | Auth | Use Case |
|------|----------|------|----------|
| Local | `http://localhost:11434` | None | Development, privacy |
| Cloud | `https://ollama.com/api` | `OLLAMA_API_KEY` | Larger models, no local GPU |

### Ollama Client Creation

```typescript
// New file: src/services/api/ollamaClient.ts
import { Ollama } from 'ollama'

export function createOllamaClient(config: {
  baseURL?: string  // defaults to localhost:11434
  apiKey?: string   // for cloud only
}) {
  return new Ollama({
    host: config.baseURL || 'http://localhost:11434',
    headers: config.apiKey
      ? { Authorization: `Bearer ${config.apiKey}` }
      : {},
  })
}
```

### Environment Variables for Ollama

| Variable | Purpose | Default |
|----------|---------|---------|
| `CLAUDE_CODE_USE_OLLAMA` | Enable Ollama provider | (disabled) |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_API_KEY` | API key for Ollama Cloud | (none) |
| `OLLAMA_MODEL` | Default model to use | (required) |

## Patterns to Follow

### Pattern 1: Dynamic Import with SDK

**What:** Providers use dynamic `import()` to load SDKs only when needed
**When:** Adding new provider SDKs
**Trade-offs:** Keeps initial bundle small, adds slight startup latency

```typescript
if (isEnvTruthy(process.env.CLAUDE_CODE_USE_OLLAMA)) {
  const { Ollama } = await import('ollama')
  // Configure and return
}
```

### Pattern 2: Type Assertion for Polymorphism

**What:** All provider SDKs return `Anthropic` type via `as unknown as Anthropic`
**When:** When provider SDKs share interface but have different implementations
**Trade-offs:** Loses type safety at boundary, enables uniform handling upstream

```typescript
return new Ollama(config) as unknown as Anthropic
```

### Pattern 3: Env Var Provider Toggle

**What:** Provider selected via `isEnvTruthy(envVar)` checks
**When:** Supporting multiple backends
**Trade-offs:** Simple, global state, no runtime provider switching

```typescript
export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'ollama'
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Hardcoding Ollama Endpoint

**What:** Using `http://localhost:11434` directly without config
**Why bad:** Breaks for cloud Ollama, no way to override for testing
**Instead:** Use `OLLAMA_BASE_URL` env var with fallback

### Anti-Pattern 2: Blocking on Ollama Health Check

**What:** Checking if Ollama is running at startup
**Why bad:** Adds startup latency, Ollama may not be needed
**Instead:** Lazy connection, fail gracefully on first request

### Anti-Pattern 3: Ignoring Tool Call Differences

**What:** Assuming Ollama tool format matches Anthropic
**Why bad:** Ollama tool calls use different structure (`tool_calls` vs `function`)
**Instead:** Build adapter layer for tool call translation

## Scalability Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single user | Local Ollama instance sufficient |
| 2-5 users | Consider Ollama Cloud for shared access |
| Team | Shared Ollama server with GPU, or cloud |

### Key Bottleneck

**Ollama memory:** Each model consumes 2-10GB RAM depending on quantization. Only one model loaded at a time per Ollama instance.

**Mitigation:** Default to smaller models (7B parameters), let users opt into larger.

## Build Order

Given dependencies between components:

```
1. Environment & Types
   - Add 'ollama' to APIProvider type in providers.ts
   - Add CLAUDE_CODE_USE_OLLAMA env var detection

2. Ollama Client Module
   - Create src/services/api/ollamaClient.ts
   - Implement createOllamaClient() factory

3. Client Integration
   - Add Ollama branch to getAnthropicClient()
   - Handle streaming response mapping

4. Tool Call Adapter
   - Build Ollama→Anthropic tool format translation
   - Test round-trip: user → tools → Ollama → response

5. Configuration & Validation
   - Add OLLAMA_BASE_URL, OLLAMA_API_KEY, OLLAMA_MODEL env vars
   - Connection validation at startup (optional, non-blocking)
```

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Ollama (local) | HTTP REST `http://localhost:11434/api/chat` | No auth, streaming |
| Ollama Cloud | HTTP REST `https://ollama.com/api` | Bearer token auth |
| Existing providers | Continue unchanged | Bedrock, Vertex, Foundry |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI → API | Async message passing | Unchanged |
| API → Ollama | Streaming HTTP | New path |
| Tool orchestration | Tool call adapter | Ollama uses different format |

## Sources

- [Ollama API Documentation](https://docs.ollama.com/api) - Official API docs
- [Ollama JavaScript Library](https://github.com/ollama/ollama-js) - Official JS SDK (npm: `ollama`)
- Existing codebase: `src/services/api/client.ts` - Provider abstraction pattern
- Existing codebase: `src/utils/model/providers.ts` - Provider type definition
