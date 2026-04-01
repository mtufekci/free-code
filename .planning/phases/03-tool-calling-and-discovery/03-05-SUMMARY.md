# Plan 03-05 Summary: User-Visible Tool Capability Notice

**Plan:** 03-05
**Phase:** 03-tool-calling-and-discovery
**Completed:** 2026-04-01

## What Was Built

### task 1: getToolCapabilityMessage() function

Added `getToolCapabilityMessage()` helper function to `src/utils/model/ollama.ts`:
- Returns `{ enabled: false, message: "Tools disabled: model does not support tool calling" }` when model doesn't support tools
- Returns `{ enabled: true, message: "" }` when tools are supported
- Returns `{ enabled: false, message: "Could not determine tool capability" }` when model info unavailable

### task 2: Integration

Integrated capability check into startup notifications:

1. **Startup Notification Hook** (`src/hooks/notifs/useOllamaToolCapabilityNotification.ts`):
   - Shows notification at startup when Ollama model doesn't support tool calling
   - Uses existing `useStartupNotification` pattern
   - Message: `"Tools disabled: model does not support tool calling"`

2. **Console Warning** (`src/services/api/ollama.ts`):
   - Logs `[Ollama] Tools disabled: model does not support tool calling` when tools are requested but model doesn't support them
   - Only warns once per session

3. **REPL Integration** (`src/screens/REPL.tsx`):
   - Added `useOllamaToolCapabilityNotification()` to startup notifications

## Files Modified

- `src/utils/model/ollama.ts` - Added getToolCapabilityMessage()
- `src/hooks/notifs/useOllamaToolCapabilityNotification.ts` - New hook for startup notification
- `src/services/api/ollama.ts` - Added console warning for tool-disabled models
- `src/screens/REPL.tsx` - Integrated notification hook

## Requirements Addressed

- **TOOL-04**: User receives visible notice when tools are disabled for unsupported models

## Verification

The notification will appear when:
1. Ollama is enabled (`CLAUDE_CODE_USE_OLLAMA=true`)
2. Model does not support tool calling
3. User starts a session

**Note:** CLI is an interactive TTY application. Testing requires:
- `bun run build` to compile changes into `./cli` binary
- OR `bun run dev` in an interactive terminal
- A model that does not support tool calling

## Commits

- `9dbc717`: feat(03-05): integrate getToolCapabilityMessage into startup notification
