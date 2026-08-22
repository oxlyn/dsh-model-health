# dsh-model-health

[![npm version](https://img.shields.io/npm/v/dsh-model-health.svg)](https://www.npmjs.com/package/dsh-model-health)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

> DeepSeek Harness (DSH) plugin: a "Model Health" panel in the settings page — lists all configured models and batch-tests their availability and latency with one click.
>
> 中文文档：[README](README.md)

![Model Health panel](snapshot.png)

## Install

### From npm (recommended)

```sh
dsh plugin --profile web add dsh-model-health
```

### From source

```sh
git clone https://github.com/oxlyn/dsh-model-health.git
cd dsh-model-health
pnpm install
pnpm run build        # tsc → dist/index.js (pure ESM) + dist/client.js

# Run from the PARENT directory (dsh plugin add anchors relative paths
# to the invoking directory):
cd ..
dsh plugin --profile web add ./dsh-model-health
dsh web
# Startup log should show: [dsh-model-health] ready — tool "list_models" + routes GET /api/model-health/json, POST /api/model-health/test
```

### Verify

After installing, open `dsh web` → Settings → Model Health; you should see a table of configured models. You can verify the plugin loads even without an API key:

```sh
dsh --profile web --dump-config | grep dsh-model-health
```

## Features

Reads `$DSH_HOME/settings.yaml` (default `~/.dsh/settings.yaml`) and provides three ways to inspect your models:

| # | Form | Entry | Description |
|---|------|-------|-------------|
| 1 | "Model Health" panel | Web UI → Settings → Model Health | React table: Provider / Model ID / Name / Context Window / Max Output / Input Modalities / API Protocol / BaseURL, with toggleable optional columns |
| 2 | Test all | "Test All" button in the panel | Concurrently (max 6) sends a minimal `max_tokens=1` chat completions request per model with a 10s timeout; per-row status badges (OK / Fail / Skip / latency), failure details on hover, results persisted to localStorage |
| 3 | Tool `list_models` | Invoked in conversation | Returns a Markdown table so the model can view the configured model list in chat |

**Highlights:**

- Supports both `llm-pi-ai` (multi-protocol custom providers) and `llm-deepseek` (official) configuration sources
- Availability testing supports `openai-completions` and `deepseek` protocols; other protocols are automatically marked "Skip"
- API keys are resolved via the DSH credential service (`ctx.credentials.resolve`) and never exposed to the browser
- Test results (status / latency / error) persist to localStorage across page refreshes

## How it works

The plugin consists of a host side and a client side (declared via the `dsh.client` field in `package.json`):

```
┌─ host side   src/index.ts → dist/index.js ──────────────────────┐
│  - ctx.tools.register: registers the list_models tool (Markdown) │
│  - ctx.webServer.register:                                        │
│      GET  /api/model-health/json  reads & parses settings.yaml    │
│      POST /api/model-health/test  minimal request per model       │
│  - resolves API keys via the DSH credential service               │
└──────────────────────────────────────────────────────────────────┘
                          │ fetch
┌─ client side src/client.js (browser module) ─────────────────────┐
│  - injects the "Model Health" panel via a settings.section slot   │
│  - React (provided by the host) renders table + badges + tooltip  │
│  - "Test All": worker pool with concurrency limit of 6            │
└──────────────────────────────────────────────────────────────────┘
```

Technical notes: pure ESM (`"type": "module"`); cordis is a peerDependency provided by the host (compile-time `import type` only); service dependencies declared via `export const inject = ['tools', 'webServer', 'credentials']`.

## Requirements

- Node `^22.19.0 || >=24.0.0` (required by the DSH host)
- pnpm (for building from source)

## Development

```sh
pnpm install
pnpm run typecheck   # type checking
pnpm run build       # build dist/
```

Project layout:

```
dsh-model-health/
├── src/index.ts          # host side: tool + HTTP routes
├── src/client.js         # client side: settings panel (browser module)
├── cordis.patch.yml      # bundle layer declaration (id/name resolve as package names)
└── dist/                 # build output (included in the published files field)
```

## Dependencies

- `@deepseek-ai/dsh-tools`: `0.1.0-rc.8` (exact — the **`next`**-tag line; npm `latest` is stale).
- `@deepseek-ai/cordis`: `^4.0.1` (peerDependency — host provides it; types-only in code).

## License

[MIT](LICENSE)
