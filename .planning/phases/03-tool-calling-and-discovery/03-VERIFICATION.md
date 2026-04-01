---
phase: 03-tool-calling-and-discovery
verified: 2026-04-01T11:30:00Z
status: human_needed
score: 5/5 must-haves verified (4 fully verified, 1 requires human confirmation)
gaps: []
human_verification_required:
  - test: "Startup notification for tool-disabled model"
    expected: "Warning message appears when using a model that doesn't support tool calling"
    why_human: "UI notification behavior requires interactive terminal testing"
---

# Phase 03: Tool Calling and Discovery Verification Report

**Phase Goal:** Tool calling works with Ollama models that support it; graceful fallback for models that don't

**Verified:** 2026-04-01T11:30:00Z

**Status:** human_needed

**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Ollama receives tool schemas in its expected format when tools are provided | ✓ VERIFIED | `translateRequestToOllama()` (lines 190-203) maps Anthropic tools to Ollama `{type: 'function', function: {...}}` format |
| 2 | Ollama tool call responses are translated to internal format | ✓ VERIFIED | `translateEventToAnthropic()` (lines 252-311) emits `content_block_start` with `tool_use`, `content_block_delta` with `input_json_delta`, and `content_block_stop` |
| 3 | System detects when model does not support tools and falls back gracefully | ✓ VERIFIED | `supportsTools` check in `withResponse()` (lines 496-512) excludes tools when `supportsTools === false`, with safe default on failure |
| 4 | Tool calling is disabled for known-unsupported models with user-visible notice | ⚠️ HUMAN NEEDED | `getToolCapabilityMessage()` exists (ollama.ts:162-185), startup notification hook created, but UI display requires human verification |
| 5 | Context window limits are respected to prevent silent truncation | ✓ VERIFIED | `num_ctx` set in request options (line 186) when `contextWindow > 0`, `model_full` mapped in `mapStopReason()` (line 219-220) |

**Score:** 5/5 truths verified (4 fully, 1 pending human confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/api/ollama.ts` | Tool request/response translation | ✓ VERIFIED | 582 lines, `translateRequestToOllama()` at lines 136-206, `translateEventToAnthropic()` at lines 231-360 |
| `src/utils/model/ollama.ts` | Model capability detection | ✓ VERIFIED | 186 lines, `extractContextWindow()` at lines 112-134, `getToolCapabilityMessage()` at lines 162-185 |
| `src/hooks/notifs/useOllamaToolCapabilityNotification.ts` | Startup notification hook | ✓ VERIFIED | 54 lines, properly imports and uses `getToolCapabilityMessage()` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|---|- --| ------ | ------- |
| `ollama.ts:translateRequestToOllama()` | `ollama.ts:OllamaTool` type | Type import | ✓ WIRED | Lines 14-18 import OllamaChatRequest, OllamaChatResponse, OllamaMessage types |
| `ollama.ts:withResponse()` | `ollama.ts:extractContextWindow()` | Direct call | ✓ WIRED | Lines 498-501 extract contextWindow and supportsTools |
| `ollama.ts:withResponse()` | `ollama.ts:getToolCapabilityMessage()` | Import | ✓ WIRED | Line 19 imports, line 505 calls |
| `useOllamaToolCapabilityNotification.ts` | `ollama.ts:getToolCapabilityMessage()` | Import | ✓ WIRED | Lines 5 and 40 use function |
| `REPL.tsx` | `useOllamaToolCapabilityNotification.ts` | Import hook call | ✓ WIRED | Lines 265, 773 integrate hook |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| TOOL-01 | 03-01 | Ollama receives tool schemas in its expected format | ✓ SATISFIED | translateRequestToOllama() maps `{name, description?, input}` to `{type: 'function', function: {name, description?, parameters}}` |
| TOOL-02 | 03-02 | Ollama tool call responses translated to internal format | ✓ SATISFIED | translateEventToAnthropic() emits proper streaming event sequence for tool calls |
| TOOL-03 | 03-04 | System detects unsupported models and falls back gracefully | ✓ SATISFIED | supportsTools check excludes tools for models that don't support them |
| TOOL-04 | 03-05 | User-visible notice when tools disabled | ⚠️ NEEDS HUMAN | getToolCapabilityMessage() returns appropriate message, hook created, UI integration wired — human verification needed to confirm notification appears |
| MODL-03 | 03-03 | Context window limits respected | ✓ SATISFIED | num_ctx set from model info, model_full mapped to end_turn |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | N/A | N/A | No anti-patterns detected |

### Human Verification Required

#### 1. Startup notification for tool-disabled model

**Test:** 
1. Set `CLAUDE_CODE_USE_OLLAMA=true`
2. Use an Ollama model that does NOT support tool calling (check with `ollama show <model>` for `model_info.tools`)
3. Start the CLI (bun run dev or ./cli)
4. Observe startup output

**Expected:** 
- Console warning: `[Ollama] Tools disabled: model does not support tool calling`
- Or visible startup notification with same message

**Why human:** UI notification system requires interactive terminal — cannot be verified via static code analysis

---

## Gap Summary

**No gaps found.** All automated checks pass. TOOL-04 requires human verification to confirm the notification actually renders in the UI, but the implementation is correctly wired.

---

_Verified: 2026-04-01T11:30:00Z_
_Verifier: OpenCode (gsd-verifier)_
