# Add Ollama Support

## What This Is

A CLI tool that serves as a local AI coding assistant powered by Ollama. Users run it in their terminal to get Claude-level coding assistance without depending on cloud APIs — everything runs locally on their machine using Ollama-hosted models.

## Core Value

Users can run a full-featured AI coding assistant entirely offline using Ollama as the model provider.

## Requirements

### Validated

- ✓ CLI application with React/Ink terminal UI — existing
- ✓ TypeScript/Bun codebase with layered architecture — existing
- ✓ Model-agnostic API client abstraction (Bedrock, Vertex, Foundry already abstracted) — existing
- ✓ Session and auth management — existing
- ✓ Tool orchestration and execution — existing

### Active

- [ ] Ollama can be selected as a model provider
- [ ] Ollama connection (local or cloud) is configured and validated
- [ ] Basic prompt → response cycle works with Ollama models
- [ ] Tool calls work with Ollama models (where supported)
- [ ] Auth/key management supports Ollama endpoints

### Out of Scope

- Ollama model management (installing models, modelPull) — use `ollama` CLI directly
- Custom Ollama API extensions beyond standard chat completions
- Supporting Ollama in non-CLI modes (bridge, daemon) initially

## Context

**Existing architecture:** The codebase already has a multi-provider API client abstraction in `src/services/api/client.ts`. Each provider (Bedrock, Vertex, Foundry) implements the same interface. Ollama should follow the same pattern — a new provider variant that routes to Ollama's API endpoint.

**Provider pattern:** The existing code already supports toggling providers via environment variables (`CLAUDE_CODE_USE_BEDROCK`, etc.). A new `CLAUDE_CODE_USE_OLLAMA` toggle would follow the same convention.

**Ollama options:** The user mentioned "Ollama cloud models" — meaning either:
- A local Ollama instance (`http://localhost:11434`)
- Ollama Cloud hosted models (`https://api.ollama.com`)

Both use the same OpenAI-compatible chat completions API, just with different base URLs.

## Constraints

- **Tech stack**: TypeScript, Bun, existing patterns — no major rewrites
- **Backward compat**: Existing cloud providers must continue working
- **Ollama compatibility**: Supports Ollama API (REST, OpenAI-compatible)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Follow existing multi-provider pattern | Bedrock/Vertex/Foundry already solved this | ✓ Good |
| OpenAI-compatible API client for Ollama | Ollama exposes OpenAI-compatible endpoint | ✓ Good |
| Environment-variable based configuration | Matches existing `CLAUDE_CODE_USE_*` pattern | ✓ Good |
| Local vs cloud Ollama via base URL config | Both supported, user chooses | — Pending |

---
*Last updated: 2026-03-31 after initialization*
