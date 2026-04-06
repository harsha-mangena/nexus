```
 _   _
| \ | | _____  ___   _ ___
|  \| |/ _ \ \/ / | | / __|
| |\  |  __/>  <| |_| \__ \
|_| \_|\___/_/\_\\__,_|___/
```

# Nexus — Personal AI Assistant

A privacy-first, self-hosted personal AI assistant that connects to all major chat platforms, dynamically routes to different LLMs based on task complexity, supports voice, and runs locally on Mac/Linux.

## Key Features

- **Multi-Platform** — Telegram, Discord, Slack, WhatsApp, and built-in CLI
- **Smart Routing** — Automatically routes messages to the best LLM (OpenAI, Gemini, or Ollama) based on intent
- **Intent Classification** — Rule-based classifier detects code, analysis, creative, agentic, and simple queries
- **Agent Tools** — Web search, HTTP fetch, file I/O, code execution, calculator, date/time
- **Voice Pipeline** — Speech-to-text (Whisper) and text-to-speech (Piper) support
- **Conversation Memory** — SQLite-backed persistent conversation history
- **Privacy-First** — Self-hosted, your data stays on your machine
- **Persona System** — Customizable assistant personality via markdown files
- **Docker Ready** — Full Docker Compose setup for one-command deployment

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CHANNEL LAYER                         │
│  Telegram │ Discord │ Slack │ WhatsApp │ CLI (built-in) │
└────────────────────────┬────────────────────────────────┘
                         │ NormalizedMessage
┌────────────────────────▼────────────────────────────────┐
│                   GATEWAY (Core)                         │
│  EventBus → SessionManager → ResponseFormatter           │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│               INTELLIGENCE LAYER                         │
│  IntentClassifier → ModelRouter → AgentOrchestrator      │
└────────┬───────────────┬────────────────┬───────────────┘
         │               │                │
┌────────▼───┐  ┌───────▼────┐  ┌────────▼───────┐
│ PROVIDERS  │  │   TOOLS    │  │    MEMORY      │
│ OpenAI     │  │ web_search │  │ SQLite store   │
│ Gemini     │  │ fs_read    │  │ conversations  │
│ Ollama     │  │ fs_write   │  │ user prefs     │
└────────────┘  │ run_code   │  └────────────────┘
                │ http_fetch │
                └────────────┘
```

## Monorepo Structure

```
nexus/
├── packages/
│   ├── shared/       # Types, schemas, config loader, logger
│   ├── core/         # Gateway, orchestrator, session manager
│   ├── router/       # Intent classifier, model selector
│   ├── providers/    # OpenAI, Gemini, Ollama (Vercel AI SDK)
│   ├── channels/     # Telegram, Discord, Slack, WhatsApp, CLI
│   ├── tools/        # Web search, HTTP fetch, FS, code runner
│   ├── memory/       # SQLite conversation storage
│   ├── voice/        # Whisper STT + Piper TTS pipeline
│   └── cli/          # Setup wizard (@clack/prompts)
└── apps/
    └── nexus/        # Main entry point, bootstrap
```

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/harsha-mangena/nexus.git
cd nexus
pnpm install
```

### 2. Run the setup wizard

```bash
pnpm setup
```

This interactive wizard will:
- Ask which chat platforms you want to connect
- Collect API keys for your chosen LLM providers
- Configure routing strategy
- Generate `.env` and `config/nexus.yaml`

### 3. Build the project

```bash
pnpm build
```

### 4. Start Nexus

```bash
pnpm start
```

### 5. Or use Docker

```bash
docker compose up -d
```

To include voice services:

```bash
docker compose --profile voice up -d
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | No* | OpenAI API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No* | Google Gemini API key |
| `OLLAMA_BASE_URL` | No* | Ollama server URL (default: http://localhost:11434) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token from @BotFather |
| `DISCORD_BOT_TOKEN` | No | Discord bot token |
| `DISCORD_APPLICATION_ID` | No | Discord application ID |
| `SLACK_BOT_TOKEN` | No | Slack bot OAuth token |
| `SLACK_APP_TOKEN` | No | Slack app-level token (for Socket Mode) |
| `SLACK_SIGNING_SECRET` | No | Slack signing secret |
| `WAHA_URL` | No | WAHA WhatsApp API URL |
| `WHISPER_URL` | No | Whisper STT server URL |
| `PIPER_URL` | No | Piper TTS server URL |

\* At least one LLM provider must be configured.

### Config File

See `config/nexus.example.yaml` for a full configuration reference. Copy it to get started:

```bash
cp config/nexus.example.yaml config/nexus.yaml
```

The config file supports hot-reloading for routing rules — no restart needed.

### Persona

Customize your assistant's personality by editing `config/persona.md`. See `config/persona.example.md` for an example.

## Channel Setup Guides

### Telegram

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Create a new bot with `/newbot`
3. Copy the bot token
4. Set `TELEGRAM_BOT_TOKEN` in your `.env`
5. Enable the telegram channel in `config/nexus.yaml`

### Discord

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** → **Add Bot**
4. Copy the bot token and application ID
5. Enable **Message Content Intent** under Privileged Gateway Intents
6. Invite the bot to your server with the OAuth2 URL Generator (scopes: `bot`, permissions: `Send Messages`, `Read Messages`)
7. Set `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` in your `.env`

### Slack

1. Go to [Slack API](https://api.slack.com/apps) and create a new app
2. Enable **Socket Mode** (requires an app-level token)
3. Add bot scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`
4. Install the app to your workspace
5. Set `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, and `SLACK_SIGNING_SECRET` in your `.env`

### WhatsApp (via WAHA)

1. WAHA runs as a Docker container alongside Nexus
2. Start with `docker compose up -d`
3. Open WAHA dashboard at `http://localhost:3001`
4. Scan the QR code with WhatsApp
5. Set `WAHA_URL=http://waha:3000` in your `.env` (or `http://localhost:3001` for local dev)

## LLM Provider Setup

### OpenAI

1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Set `OPENAI_API_KEY` in your `.env`
3. Default model: `gpt-4o`

### Google Gemini

1. Get an API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Set `GOOGLE_GENERATIVE_AI_API_KEY` in your `.env`
3. Default model: `gemini-2.0-flash`

### Ollama (Local)

1. Install [Ollama](https://ollama.com)
2. Pull a model: `ollama pull llama3.2`
3. Ollama runs on `http://localhost:11434` by default
4. Set `OLLAMA_BASE_URL` in your `.env` if using a different address

## Intent-Based Routing

Nexus automatically classifies each message and routes it to the best model:

| Intent | Default Provider | Model | Use Case |
|--------|-----------------|-------|----------|
| SIMPLE | Google | gemini-2.0-flash | Greetings, Q&A, small talk |
| CODE | OpenAI | gpt-4o | Programming, debugging, code review |
| CREATIVE | OpenAI | gpt-4o | Writing, brainstorming, content |
| ANALYSIS | Google | gemini-2.0-pro-exp | Research, comparisons, data analysis |
| AGENTIC | OpenAI | gpt-4o | Web search, file ops, multi-step tasks |
| VOICE | Ollama | llama3.2 | Voice message responses |

Provider fallback: if the configured provider is unavailable, Nexus automatically falls back to an available one.

## Voice Setup

Voice requires the Whisper and Piper Docker containers:

```bash
docker compose --profile voice up -d
```

- **Whisper** (STT): Transcribes voice messages to text
- **Piper** (TTS): Converts text responses to speech

Set `WHISPER_URL` and `PIPER_URL` in your `.env` to enable voice in your config.

## Agent Tools

When a message is classified as AGENTIC or CODE, Nexus can use these tools:

| Tool | Description |
|------|-------------|
| `web_search` | Search the web via DuckDuckGo |
| `http_fetch` | Fetch and extract content from URLs |
| `fs_read` | Read files (sandboxed to allowed paths) |
| `fs_write` | Write files (sandboxed to allowed paths) |
| `run_code` | Execute JavaScript, Python, or Bash snippets |
| `datetime` | Get current date/time in any timezone |
| `calculator` | Evaluate mathematical expressions |

## Development

### Prerequisites

- Node.js 22+
- pnpm 9+

### Build all packages

```bash
pnpm build
```

### Run in development mode

```bash
pnpm dev
```

### Clean build artifacts

```bash
pnpm clean
```

### Project structure

The project uses **pnpm workspaces** to manage the monorepo. Each package in `packages/` is independently buildable and has its own `tsconfig.json` extending the root `tsconfig.base.json`.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Build and test: `pnpm build`
5. Commit: `git commit -m "Add my feature"`
6. Push: `git push origin feature/my-feature`
7. Open a pull request

## License

MIT
