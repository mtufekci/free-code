---
phase: 04-zero-config-experience
plan: '01'
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/model/ollama.ts
  - src/hooks/notifs/useOllamaDetectionNotification.ts
autonomous: false
requirements:
  - PROV-04
must_haves:
  truths:
    - "User sees a suggestion to enable Ollama when the CLI or base URL is detected"
    - "User does NOT see the suggestion when they have explicitly set CLAUDE_CODE_USE_OLLAMA=true"
    - "User can dismiss the notification and it does not reappear"
  artifacts:
    - path: "src/utils/model/ollama.ts"
      provides: "Ollama availability detection function"
      min_lines: 30
      contains: "detectOllamaAvailability|shouldSuggestOllama"
    - path: "src/hooks/notifs/useOllamaDetectionNotification.ts"
      provides: "Startup notification hook for Ollama detection"
      min_lines: 30
      contains: "useOllamaDetectionNotification"
  key_links:
    - from: "src/hooks/notifs/useOllamaDetectionNotification.ts"
      to: "src/hooks/notifs/useStartupNotification.ts"
      via: "useStartupNotification hook call"
      pattern: "useStartupNotification"
    - from: "src/hooks/notifs/useOllamaDetectionNotification.ts"
      to: "src/utils/model/ollama.ts"
      via: "detectOllamaAvailability() and shouldSuggestOllama() calls"
      pattern: "detectOllamaAvailability|shouldSuggestOllama"
---

<objective>
System detects OLLAMA_BASE_URL or local Ollama CLI presence and suggests enabling Ollama.
</objective>

<purpose>
When users have Ollama installed or configured but haven't enabled it, they should be notified at startup with a clear path to enable it. This reduces friction for offline AI assistance.
</purpose>

<context>
@src/utils/model/ollama.ts (existing utilities)
@src/hooks/notifs/useStartupNotification.ts (existing startup notification pattern)
</context>

<tasks>

<task type="auto">
  <name>task 1: Add detectOllamaAvailability() to ollama.ts</name>
  <files>src/utils/model/ollama.ts</files>
  <action>
Add to src/utils/model/ollama.ts:

1. OllamaAvailability interface:
   type OllamaAvailability = {
     hasCli: boolean;
     hasBaseUrl: boolean;
     baseUrl: string | null;
   }

2. detectOllamaAvailability(): Async function that:
   - Uses `which('ollama')` to detect CLI presence (returns path or null)
   - Checks if OLLAMA_BASE_URL env var is set
   - Returns OllamaAvailability object

3. shouldSuggestOllama(): Async function that:
   - Returns true if Ollama is available (CLI or URL) but NOT enabled (CLAUDE_CODE_USE_OLLAMA != 'true')
   - Returns false if already enabled or not available

Export both for use in the notification hook.
  </action>
  <verify>grep -n "detectOllamaAvailability|shouldSuggestOllama|OllamaAvailability" src/utils/model/ollama.ts</verify>
  <done>detectOllamaAvailability() and shouldSuggestOllama() are exported from src/utils/model/ollama.ts</done>
</task>

<task type="auto">
  <name>task 2: Create useOllamaDetectionNotification.ts</name>
  <files>src/hooks/notifs/useOllamaDetectionNotification.ts</files>
  <action>
Create src/hooks/notifs/useOllamaDetectionNotification.ts:

1. Import useStartupNotification from ../useStartupNotification
2. Create useOllamaDetectionNotification() function that:
   - Calls useStartupNotification() to get addNotification function
   - Has internal checkOllamaDetection() async function that:
     - Returns null if CLAUDE_CODE_USE_OLLAMA='true' (already enabled)
     - Calls shouldSuggestOllama() to check availability
     - Returns null if Ollama not available
     - Returns notification object if available but not enabled:
       - key: 'ollama-detected-suggest-enable'
       - color: 'info'
       - priority: 'high'
       - timeout: 15000ms
       - message varies based on detection type:
         - CLI only: "Ollama CLI detected. Enable it for local AI assistance."
         - URL only: "OLLAMA_BASE_URL detected. Enable it for local AI assistance."
         - Both: "Ollama CLI and OLLAMA_BASE_URL detected. Enable it for local AI assistance."
3. Export useOllamaDetectionNotification
  </action>
  <verify>grep -n "useOllamaDetectionNotification|ollama-detected-suggest-enable" src/hooks/notifs/useOllamaDetectionNotification.ts</verify>
  <done>useOllamaDetectionNotification hook created with correct notification key, color, priority, and timeout</done>
</task>

<task type="auto">
  <name>task 3: Verify implementation</name>
  <files>src/utils/model/ollama.ts, src/hooks/notifs/useOllamaDetectionNotification.ts</files>
  <action>
Run verification commands to ensure implementation is correct:

1. Run TypeScript type check: bun run typecheck (or npx tsc --noEmit)
2. Run tests: bun test
3. Verify exports are correct

If there are type errors, fix them before completing.
  </action>
  <verify>bun run typecheck && bun test</verify>
  <done>All type checks pass and all tests pass</done>
</task>

</tasks>

<verification>
- detectOllamaAvailability() is exported and returns correct shape
- shouldSuggestOllama() returns true when CLI or URL detected but not enabled
- shouldSuggestOllama() returns false when CLAUDE_CODE_USE_OLLAMA=true
- useOllamaDetectionNotification hook exists with correct notification config
- No type errors introduced
- All existing tests pass
</verification>

<success_criteria>
When Ollama is detected (via CLI or OLLAMA_BASE_URL) but not enabled, user sees an info notification at startup suggesting to enable it. The notification does not appear if CLAUDE_CODE_USE_OLLAMA=true.
</success_criteria>

<output>
After completion, create .planning/phases/04-zero-config-experience/04-01-SUMMARY.md
</output>
