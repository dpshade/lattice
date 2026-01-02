# Lattice

> The Dockerfile for AI coding workflows. One config to share your entire setup—agents, models, routing, VCS, plugins—in a single portable file.

## Quick Start

```bash
# Install globally
bun link

# Create a workflow
lattice init

# Or clone someone's workflow
lattice init --from dpshade/ai-workflow

# Validate your setup
lattice validate

# Generate opencode configs
lattice generate
```

## Portable Workflows

Export your entire AI coding setup:
```bash
# Computer A - export everything
lattice export myworkflow.zip

# Computer B - import and run
lattice init --from myworkflow.zip
# Done. Everything working.
```

## What Lattice Manages

| What | How |
|------|-----|
| Agent definitions | `agents/*.md` files with system prompts |
| Model routing | Per-agent model preferences with fallbacks |
| Providers | API keys, budgets, auth plugins |
| MCP servers | Context7, Exa, grep.app, custom servers |
| Plugins | Version-pinned (oh-my-opencode, jj-opencode) |
| VCS workflow | jj-workspace, jj-checkpoint, git-stash presets |
| Commands | Custom slash commands |
| Hooks | pre_agent, post_agent lifecycle events |

## Commands

```bash
lattice init [--from <source>]     # Create or clone workflow
lattice validate                   # Check config validity
lattice generate                   # Generate opencode.json, oh-my-opencode.json
lattice export [--format zip|yaml] # Export for sharing
lattice status                     # Show workflow status
lattice plugins                    # List plugins
lattice plugins sync               # Install from lattice.yaml
lattice snapshot [--name <name>]   # Backup current config
```

## Example lattice.yaml

```yaml
name: my-workflow
description: "My AI coding workflow"
version: 1.0.0

vcs:
  preset: jj-workspace

plugins:
  - oh-my-opencode@2.3.1

providers:
  anthropic:
    env: ANTHROPIC_API_KEY
  openai:
    env: OPENAI_API_KEY
    local_budget: 50

defaults:
  agents_dir: ./agents
  routing:
    - anthropic/claude-sonnet-4-5
    - openai/gpt-4o

agents:
  architect:
    path: architect.md
    triggers: [/architect, /design]
    routing:
      - anthropic/claude-opus-4-5
      - openai/o3

mcp:
  context7:
    enabled: true
  websearch_exa:
    enabled: true
```

## Status

| Field | Value |
|-------|-------|
| **Version** | 0.2.0 |
| **Status** | Beta |
| **Stack** | TypeScript, Bun |

## Features

- **Portable workflows** — lattice init --from clones entire setups
- **Single config file** — lattice.yaml replaces scattered configs
- **Distribution routing** — Pattern, weighted, round-robin, burst strategies
- **Plugin management** — Version-pinned plugins with lattice plugins sync
- **VCS presets** — jj-workspace, jj-checkpoint, git-stash
- **Config generation** — lattice generate outputs opencode configs
- **Validation** — lattice validate checks everything is configured correctly

## Development

```bash
# Install deps
bun install

# Run tests
bun test

# Type check
bun run tsc --noEmit

# Link globally for testing
bun link
```

## License

MIT
