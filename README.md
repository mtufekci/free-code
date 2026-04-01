<p align="center">
  <img src="assets/screenshot.png" alt="free-code" width="720" />
</p>

<h1 align="center">free-code</h1>

<p align="center">
  <strong>The free build of Claude Code — now with full Ollama support.</strong><br>
  All telemetry stripped. All guardrails removed. All experimental features unlocked.<br>
  Full local LLM support via Ollama. WebBrowser tool with Playwright.<br>
  One binary, zero callbacks home.
</p>

<p align="center">
  <a href="#quick-install"><img src="https://img.shields.io/badge/install-one--liner-blue?style=flat-square" alt="Install" /></a>
  <a href="https://github.com/mtufekci/free-code/stargazers"><img src="https://img.shields.io/github/stars/mtufekci/free-code?style=flat-square" alt="Stars" /></a>
  <a href="https://github.com/mtufekci/free-code/issues"><img src="https://img.shields.io/github/issues/mtufekci/free-code?style=flat-square" alt="Issues" /></a>
  <a href="https://github.com/mtufekci/free-code/blob/main/FEATURES.md"><img src="https://img.shields.io/badge/features-88%20flags-orange?style=flat-square" alt="Feature Flags" /></a>
  <a href="#ipfs-mirror"><img src="https://img.shields.io/badge/IPFS-mirrored-teal?style=flat-square" alt="IPFS" /></a>
</p>

---

## Quick Install

```bash
git clone https://github.com/mtufekci/free-code.git
cd free-code && bun install && bun run build:dev
```

> Clone, install, build — then run `./cli-dev`. Works with Anthropic API keys, OpenAI Codex, **or** local Ollama models.

Then run `free-code` and use the `/login` command to authenticate with your preferred model provider.

---

## Table of Contents

- [What is this](#what-is-this)
- [Model Providers](#model-providers)
- [Quick Install](#quick-install)
- [Requirements](#requirements)
- [Build](#build)
- [Usage](#usage)
- [Experimental Features](#experimental-features)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [IPFS Mirror](#ipfs-mirror)
- [Contributing](#contributing)
- [License](#license)

---

## What is this

A clean, buildable fork of Anthropic's [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI -- the terminal-native AI coding agent. The upstream source became publicly available on March 31, 2026 through a source map exposure in the npm distribution.

This fork applies three categories of changes on top of that snapshot:

### Telemetry removed

The upstream binary phones home through OpenTelemetry/gRPC, GrowthBook analytics, Sentry error reporting, and custom event logging. In this build:

- All outbound telemetry endpoints are dead-code-eliminated or stubbed
- GrowthBook feature flag evaluation still works locally (needed for runtime feature gates) but does not report back
- No crash reports, no usage analytics, no session fingerprinting

### Security-prompt guardrails removed

Anthropic injects system-level instructions into every conversation that constrain Claude's behavior beyond what the model itself enforces. These include hardcoded refusal patterns, injected "cyber risk" instruction blocks, and managed-settings security overlays pushed from Anthropic's servers.

This build strips those injections. The model's own safety training still applies -- this just removes the extra layer of prompt-level restrictions that the CLI wraps around it.

### Full Ollama integration (local-first LLM)

Run the entire Claude Code experience with local models — no API key needed, no cloud dependency:

- **Drop-in Ollama support** — set `CLAUDE_CODE_USE_OLLAMA=1` and go
- **Auto-detection** of model capabilities (tools, vision, thinking) via `/api/show`
- **Streaming** with proper Anthropic event translation (NDJSON → SSE)
- **Tool calling** works with all 23+ built-in tools (schemas correctly mapped to OpenAI function-calling format)
- **ULTRATHINK** works with models that support thinking (e.g. `qwen3:8b`, `qwen3.5`)
- **Proper 3P provider handling** — Ollama is treated as a first-class third-party provider, bypassing all Anthropic auth, OAuth, grove checks, and quota status calls
- **Dynamic model listing** — `/model` picker fetches available models from your running Ollama instance

Tested with: `qwen3:8b`, `qwen3.5:397b-cloud`, `qwen3-vl:235b`, `llama3.1`, `mistral`, `deepseek-r1`

### WebBrowser tool (Playwright)

A new built-in tool that gives the model a real headless browser:

- Navigate to URLs and read rendered page content
- Click elements, fill forms, interact with dynamic pages
- Take screenshots, execute JavaScript, wait for elements
- Uses Playwright with Chromium — works in headless and headed mode
- Fully integrated into the tool permission system

### Experimental features unlocked

Claude Code ships with 88 feature flags gated behind `bun:bundle` compile-time switches. Most are disabled in the public npm release. This build unlocks all 54 flags that compile cleanly. See [Experimental Features](#experimental-features) below, or refer to [FEATURES.md](FEATURES.md) for the full audit.

---

## Model Providers

free-code supports **six API providers** out of the box. Set the corresponding environment variable to switch providers -- no code changes needed.

### Anthropic (Direct API) -- Default

Use Anthropic's first-party API directly.

| Model | ID |
|---|---|
| Claude Opus 4.6 | `claude-opus-4-6` |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| Claude Haiku 4.5 | `claude-haiku-4-5` |

### OpenAI Codex

Use OpenAI's Codex models for code generation. Requires a Codex subscription.

| Model | ID |
|---|---|
| GPT-5.3 Codex (recommended) | `gpt-5.3-codex` |
| GPT-5.4 | `gpt-5.4` |
| GPT-5.4 Mini | `gpt-5.4-mini` |

```bash
export CLAUDE_CODE_USE_OPENAI=1
free-code
```

### Ollama (Local LLM)

Use local models via Ollama — no API key, no cloud dependency.

```bash
export CLAUDE_CODE_USE_OLLAMA=1
export OLLAMA_MODEL=qwen3:8b
./cli-dev
```

### AWS Bedrock

Route requests through your AWS account via Amazon Bedrock.

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION="us-east-1"   # or AWS_DEFAULT_REGION
free-code
```

Uses your standard AWS credentials (environment variables, `~/.aws/config`, or IAM role). Models are mapped to Bedrock ARN format automatically (e.g., `us.anthropic.claude-opus-4-6-v1`).

| Variable | Purpose |
|---|---|
| `CLAUDE_CODE_USE_BEDROCK` | Enable Bedrock provider |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | AWS region (default: `us-east-1`) |
| `ANTHROPIC_BEDROCK_BASE_URL` | Custom Bedrock endpoint |
| `AWS_BEARER_TOKEN_BEDROCK` | Bearer token auth |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | Skip auth (testing) |

### Google Cloud Vertex AI

Route requests through your GCP project via Vertex AI.

```bash
export CLAUDE_CODE_USE_VERTEX=1
free-code
```

Uses Google Cloud Application Default Credentials (`gcloud auth application-default login`). Models are mapped to Vertex format automatically (e.g., `claude-opus-4-6@latest`).

### Anthropic Foundry

Use Anthropic Foundry for dedicated deployments.

```bash
export CLAUDE_CODE_USE_FOUNDRY=1
export ANTHROPIC_FOUNDRY_API_KEY="..."
free-code
```

Supports custom deployment IDs as model names.

### Provider Selection Summary

| Provider | Env Variable | Auth Method |
|---|---|---|
| Anthropic (default) | -- | `ANTHROPIC_API_KEY` or OAuth |
| OpenAI Codex | `CLAUDE_CODE_USE_OPENAI=1` | OAuth via OpenAI |
| Ollama (local) | `CLAUDE_CODE_USE_OLLAMA=1` | None (local) |
| AWS Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` | AWS credentials |
| Google Vertex AI | `CLAUDE_CODE_USE_VERTEX=1` | `gcloud` ADC |
| Anthropic Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | `ANTHROPIC_FOUNDRY_API_KEY` |

---

## Requirements

- **Runtime**: [Bun](https://bun.sh) >= 1.3.11
- **OS**: macOS or Linux (Windows via WSL)
- **Auth**: An API key or OAuth login for your chosen provider, **or** [Ollama](https://ollama.com) running locally

```bash
# Install Bun if you don't have it
curl -fsSL https://bun.sh/install | bash

# Optional: install Ollama for local LLM support
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3:8b
```

---

## Build

```bash
# Clone the repo
git clone https://github.com/mtufekci/free-code.git
cd free-code

# Install dependencies
bun install

# Standard build -- produces ./cli
bun run build

# Dev build -- dev version stamp, experimental GrowthBook key
bun run build:dev

# Dev build with ALL experimental features enabled -- produces ./cli-dev
bun run build:dev:full

# Compiled build (alternative output path) -- produces ./dist/cli
bun run compile
```

### Build Variants

| Command | Output | Features | Description |
|---|---|---|---|
| `bun run build` | `./cli` | `VOICE_MODE` only | Production-like binary |
| `bun run build:dev` | `./cli-dev` | All experimental flags + Ollama + WebBrowser | **Recommended** — full unlock build |
| `bun run build:dev:full` | `./cli-dev` | All 54 experimental flags | Full unlock build |
| `bun run compile` | `./dist/cli` | `VOICE_MODE` only | Alternative output path |

### Custom Feature Flags

Enable specific flags without the full bundle:

```bash
# Enable just ultraplan and ultrathink
bun run ./scripts/build.ts --feature=ULTRAPLAN --feature=ULTRATHINK

# Add a flag on top of the dev build
bun run ./scripts/build.ts --dev --feature=BRIDGE_MODE
```

---

## Usage

### With Anthropic API

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
./cli-dev
```

### With Ollama (local, no API key needed)

```bash
export CLAUDE_CODE_USE_OLLAMA=1
export OLLAMA_MODEL=qwen3:8b        # or any model you've pulled
./cli-dev
```

You can also set `OLLAMA_BASE_URL` if Ollama isn't on `localhost:11434`.

### Quick test

```bash
# Interactive REPL (default)
./cli-dev

# One-shot mode
./cli-dev -p "what files are in this directory?"

# Specify a model
./cli --model claude-opus-4-6

# One-shot mode (Ollama)
CLAUDE_CODE_USE_OLLAMA=1 OLLAMA_MODEL=qwen3:8b ./cli-dev -p "read README.md and summarize it"

# Switch model at runtime
# Type /model in the REPL to pick from available models

# Run from source (slower startup)
bun run dev

# OAuth login
./cli /login
```

### Environment Variables Reference

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_AUTH_TOKEN` | Auth token (alternative) |
| `ANTHROPIC_MODEL` | Override default model |
| `ANTHROPIC_BASE_URL` | Custom API endpoint |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Custom Opus model ID |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Custom Sonnet model ID |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Custom Haiku model ID |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token via env |
| `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` | API key helper cache TTL |

---

## Experimental Features

The `bun run build:dev:full` build enables all 54 working feature flags. Highlights:

### Interaction & UI

| Flag | Description |
|---|---|
| `ULTRAPLAN` | Remote multi-agent planning on Claude Code web (Opus-class) |
| `ULTRATHINK` | Deep thinking mode -- type "ultrathink" to boost reasoning effort |
| `VOICE_MODE` | Push-to-talk voice input and dictation |
| `TOKEN_BUDGET` | Token budget tracking and usage warnings |
| `HISTORY_PICKER` | Interactive prompt history picker |
| `MESSAGE_ACTIONS` | Message action entrypoints in the UI |
| `QUICK_SEARCH` | Prompt quick-search |
| `SHOT_STATS` | Shot-distribution stats |

### Agents, Memory & Planning

| Flag | Description |
|---|---|
| `BUILTIN_EXPLORE_PLAN_AGENTS` | Built-in explore/plan agent presets |
| `VERIFICATION_AGENT` | Verification agent for task validation |
| `AGENT_TRIGGERS` | Local cron/trigger tools for background automation |
| `AGENT_TRIGGERS_REMOTE` | Remote trigger tool path |
| `EXTRACT_MEMORIES` | Post-query automatic memory extraction |
| `COMPACTION_REMINDERS` | Smart reminders around context compaction |
| `CACHED_MICROCOMPACT` | Cached microcompact state through query flows |
| `TEAMMEM` | Team-memory files and watcher hooks |

### Tools & Infrastructure

| Flag | Description |
|---|---|
| `BRIDGE_MODE` | IDE remote-control bridge (VS Code, JetBrains) |
| `BASH_CLASSIFIER` | Classifier-assisted bash permission decisions |
| `PROMPT_CACHE_BREAK_DETECTION` | Cache-break detection in compaction/query flow |

See [FEATURES.md](FEATURES.md) for the complete audit of all 88 flags, including 34 broken flags with reconstruction notes.

---

## Project Structure

```
scripts/
  build.ts                # Build script with feature flag system

src/
  entrypoints/cli.tsx     # CLI entrypoint
  commands.ts             # Command registry (slash commands)
  tools.ts                # Tool registry (agent tools)
  QueryEngine.ts          # LLM query engine
  screens/REPL.tsx        # Main interactive UI (Ink/React)

  commands/               # /slash command implementations
  tools/                  # Agent tool implementations (Bash, Read, Edit, WebBrowser, etc.)
  components/             # Ink/React terminal UI components
  hooks/                  # React hooks
  services/               # API clients, MCP, OAuth, analytics
    api/                  # API client + Codex fetch adapter + Ollama client
    oauth/                # OAuth flows (Anthropic + OpenAI)
  state/                  # App state store
  utils/                  # Utilities
    model/                # Model configs, providers, validation
  skills/                 # Skill system
  plugins/                # Plugin system
  bridge/                 # IDE bridge
  voice/                  # Voice input
  tasks/                  # Background task management
```

---

## Tech Stack

| | |
|---|---|
| **Runtime** | [Bun](https://bun.sh) |
| **Language** | TypeScript |
| **Terminal UI** | React + [Ink](https://github.com/vadimdemedes/ink) |
| **CLI Parsing** | [Commander.js](https://github.com/tj/commander.js) |
| **Schema Validation** | Zod v4 |
| **Code Search** | ripgrep (bundled + system fallback) |
| **Browser Automation** | [Playwright](https://playwright.dev) (Chromium) |
| **Protocols** | MCP, LSP |
| **APIs** | Anthropic Messages, OpenAI Codex, Ollama (local), AWS Bedrock, Google Vertex AI |

---

## Ollama integration details

The Ollama integration is a full rewrite of the API client layer, not a simple proxy:

| Component | What was done |
|---|---|
| **API client** (`ollama.ts`) | Custom client mimicking Anthropic SDK interface — translates requests/responses bidirectionally |
| **Streaming** | NDJSON → Anthropic SSE event translation with proper `content_block_start/delta/stop` events |
| **Tool schemas** | Anthropic `input_schema` → OpenAI function-calling `parameters` format |
| **Tool responses** | Ollama tool call results → Anthropic `tool_result` block format |
| **Model capabilities** | Auto-detected via `/api/show` — tools, vision, thinking support per model |
| **Auth bypass** | Ollama treated as 3P provider — all Anthropic OAuth, grove, quota, and org validation skipped |
| **Token estimation** | Falls back to character-based estimation when tiktoken unavailable |
| **ULTRATHINK** | Works with thinking-capable models (qwen3, deepseek-r1) — maps to `think` parameter |
| **Tool search** | Disabled for Ollama (requires Anthropic's `tool_reference` beta) — all tools sent inline |
| **Fast mode** | Skipped for non-firstParty providers — no unnecessary Anthropic API calls |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_CODE_USE_OLLAMA` | `0` | Set to `1` to enable Ollama |
| `OLLAMA_MODEL` | `qwen3:8b` | Model to use (must be pulled in Ollama) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |

### Known behavior

- First tool call may fail validation if the model sends slightly wrong parameter formats — the error is sent back and models self-correct on retry
- Very large tool schemas (30+ tools) may slow down smaller models — consider using a 70B+ model for best tool-calling accuracy
- Vision (image) input works with multimodal models like `qwen3-vl` and `llava`

---

## IPFS Mirror

A full copy of this repository is permanently pinned on IPFS via Filecoin:

| | |
|---|---|
| **CID** | `bafybeiegvef3dt24n2znnnmzcud2vxat7y7rl5ikz7y7yoglxappim54bm` |
| **Gateway** | https://w3s.link/ipfs/bafybeiegvef3dt24n2znnnmzcud2vxat7y7rl5ikz7y7yoglxappim54bm |

If this repo gets taken down, the code lives on.

---

## Contributing

Contributions are welcome. If you're working on restoring one of the 34 broken feature flags, check the reconstruction notes in [FEATURES.md](FEATURES.md) first -- many are close to compiling and just need a small wrapper or missing asset.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add something'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

---

## License

The original Claude Code source is the property of Anthropic. This fork exists because the source was publicly exposed through their npm distribution. Use at your own discretion.
