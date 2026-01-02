# Lattice: Design Document

> **One config to rule your AI coding stack.**

Lattice is the control plane for AI-assisted development. It unifies agents, models, providers, plugins, and version control into a single declarative configuration.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Core Insight](#core-insight)
3. [What Lattice Decides](#what-lattice-decides)
4. [Architecture](#architecture)
5. [Configuration Schema](#configuration-schema)
6. [Agent Files](#agent-files)
7. [Commands](#commands)
8. [VCS Presets](#vcs-presets)
9. [Routing Logic](#routing-logic)
10. [MCP Integration](#mcp-integration)
11. [Hooks](#hooks)
12. [Plugin Management](#plugin-management)
13. [Workflow Sharing](#workflow-sharing)
14. [Build Plan](#build-plan)
15. [Non-Goals](#non-goals)
16. [Open Questions](#open-questions)

---

## Problem Statement

### The Personal Problem

A power user running AI coding tools today manages:

| What | Where | Problem |
|------|-------|---------|
| Agent definitions | Scattered markdown files | No unified view |
| Model assignments | Mental model, maybe comments | Not declarative |
| Provider API keys | Environment variables | No visibility |
| Provider preferences | Head ("use Claude for X, GPT for Y") | Not reproducible |
| Cost/budget tracking | Provider dashboards (laggy, manual) | No local awareness |
| Plugin versions | package.json, manual installs | Drift, no pinning |
| VCS workflow | Separate tool (jj-opencode, git) | Not integrated |

**Result:** Configuration sprawl. No single source of truth. Reproducibility is impossible.

### The Sharing Problem (Bigger)

Sharing an AI coding workflow today means:

1. "Install oh-my-opencode"
2. "Here's my oh-my-opencode.json"
3. "Also install jj-opencode"
4. "Set up these env vars"
5. "Here are my agent markdown files"
6. "Oh and configure your models like this"
7. "And here's how I think about which agent to use when"

**That's a README, not a portable workflow.**

There's no equivalent of:
- `docker-compose up` for AI coding setups
- `terraform apply` for workflow infrastructure
- `chezmoi apply` for development environments

**lattice.yaml becomes the Dockerfile of AI coding workflows.**

---

## Core Insight

**Terraform solved this for infrastructure. Lattice solves it for AI coding.**

### The Precedents

| Before | After | Unit of Sharing |
|--------|-------|-----------------|
| "Install packages, configure nginx, set up postgres..." | `docker-compose up` | docker-compose.yml |
| "Here's my vim config, install these plugins..." | `chezmoi apply` | dotfiles repo |
| "Set up this infra, these IAM roles..." | `terraform apply` | .tf files |
| "Install these plugins, configure agents, set up auth..." | `lattice init --from` | lattice.yaml |

### What This Enables

```bash
# Someone shares their workflow
lattice init --from dpshade/ai-workflow

# You now have:
# - Their agent definitions (markdown files)
# - Their model routing strategy
# - Their VCS approach (jj-workspace, etc.)
# - Their plugin stack (versioned)
# - Working setup in one command
```

### The Value Layers

**Layer 1: Personal productivity**
- One config file instead of scattered setup
- Reproducible across machines
- Version-controlled workflow

**Layer 2: Shareability**
- Workflows become portable
- Learn from others' setups
- Ecosystem of reusable patterns

**Layer 3: Network effects (potential)**
- lattice.yaml in every AI coding repo
- Standard for workflow distribution
- Infrastructure position in ecosystem

---

## What Lattice Decides

| Decision | Source |
|----------|--------|
| Which agent? | Trigger mapping (`/architect` → `architect`) |
| Which model? | Agent's `routing` list + distribution strategy |
| Which provider? | Model prefix + fallback logic |
| Which call in sequence? | Routing state (pattern index, call count) |
| Which system prompt? | Agent's `path` → markdown file |
| Which plugins active? | `plugins` array with versions |
| Which MCP servers? | `mcp` configuration |
| Which VCS workflow? | `vcs.preset` + config overrides |
| What happens before/after? | `hooks` lifecycle events |
| Custom shortcuts? | `commands` definitions |
| Where are agent files? | `defaults.agents_dir` |
| Machine-specific overrides? | `lattice.local.yaml` |

**One file. Full control. Everything else is generated.**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                           LATTICE                                 │
│                                                                   │
│  User Input ─→ Route ─→ Agent ─→ Model ─→ Provider               │
│       │                   │                   │                   │
│       │                   │                   └─→ Usage Tracking  │
│       │                   │                                       │
│       │                   └─→ System Prompt (from .md file)       │
│       │                                                           │
│       └─→ VCS Action (checkpoint, workspace, push)                │
│                                                                   │
│  Plugins: [jj-opencode, oh-my-opencode, auth, ...]               │
└──────────────────────────────────────────────────────────────────┘
```

### Layer Stack

```
┌─────────────────────────────────────────┐
│  lattice (control plane)                │
│  - Unified config (lattice.yaml)        │
│  - Plugin management + versions         │
│  - Provider routing (per-agent)         │
│  - Local usage tracking                 │
├─────────────────────────────────────────┤
│  Managed Plugins                        │
│  ├── jj-opencode (VCS workflow)         │
│  ├── oh-my-opencode (curated agents)    │
│  └── auth plugins (antigravity, etc.)   │
├─────────────────────────────────────────┤
│  opencode (runtime)                     │
└─────────────────────────────────────────┘
```

**Key insight:** Lattice doesn't reimplement what plugins do. It orchestrates them.

- jj-opencode handles VCS workflow → Lattice manages it as a plugin
- oh-my-opencode provides curated agents → Lattice adds your custom agents on top
- Auth plugins handle provider auth → Lattice routes to them

---

## Configuration Schema

### Full Example

```yaml
# lattice.yaml
# The complete definition of an AI coding workflow

# ─────────────────────────────────────────────────────────────────
# Metadata
# ─────────────────────────────────────────────────────────────────
name: dpshade-workflow
description: "JJ-first parallel AI development with cost-conscious routing"
version: 1.0.0

# ─────────────────────────────────────────────────────────────────
# Version Control Strategy
# ─────────────────────────────────────────────────────────────────
vcs:
  preset: jj-workspace
  
  config:
    workspace_dir: .workspaces
    gate_enforcement: true
    auto_cleanup: true
    checkpoint_message: "checkpoint: before {agent}"
    commit_message: "ai({agent}): {summary}"

# ─────────────────────────────────────────────────────────────────
# Plugins (version-pinned)
# ─────────────────────────────────────────────────────────────────
plugins:
  - jj-opencode@1.0.0
  - oh-my-opencode@2.2.0
  - opencode-antigravity-auth@1.1.2
  - opencode-openai-codex-auth@4.1.0

# ─────────────────────────────────────────────────────────────────
# Providers
# ─────────────────────────────────────────────────────────────────
providers:
  anthropic:
    env: ANTHROPIC_API_KEY
    tier: pro
    local_budget: unlimited
    
  openai:
    env: OPENAI_API_KEY
    tier: plus
    local_budget: 50
    
  google:
    auth: antigravity
    tier: subscription
    local_budget: unlimited
    
  ollama:
    models:
      - llama3.1:8b
      - llama3.1:70b
      - deepseek-coder:33b
      - qwen2.5-coder:32b

# ─────────────────────────────────────────────────────────────────
# Defaults
# ─────────────────────────────────────────────────────────────────
defaults:
  agents_dir: ./agents
  routing:
    - anthropic/claude-sonnet-4-5
    - google/gemini-2.5-flash
    - ollama/llama3.1:70b

# ─────────────────────────────────────────────────────────────────
# Agents
# ─────────────────────────────────────────────────────────────────
agents:

  # ─── Planning & Architecture ───
  
  architect:
    path: architect.md
    description: "High-level design, system architecture, technical decisions"
    triggers: [/architect, /design, /plan]
    routing:
      - anthropic/claude-opus-4-5
      - openai/o3
      - anthropic/claude-sonnet-4-5

  oracle:
    path: oracle.md
    description: "Debugging, root cause analysis, strategic advice"
    triggers: [/oracle, /debug, /why]
    routing:
      - openai/gpt-5.2
      - anthropic/claude-opus-4-5

  # ─── Implementation ───
  
  implementer:
    path: implementer.md
    description: "Write code, implement features"
    triggers: [/implement, /code, /do, /build]
    routing:
      - anthropic/claude-sonnet-4-5
      - google/gemini-2.5-flash
      - ollama/deepseek-coder:33b

  frontend:
    path: frontend.md
    description: "UI/UX implementation, styling, components"
    triggers: [/frontend, /ui, /component, /style]
    routing:
      - google/gemini-3-pro
      - anthropic/claude-sonnet-4-5

  # ─── Research & Analysis ───
  
  librarian:
    path: librarian.md
    description: "Documentation lookup, codebase research"
    triggers: [/librarian, /docs, /research, /how]
    routing:
      - anthropic/claude-sonnet-4-5
      - google/gemini-2.5-flash

  explore:
    path: explore.md
    description: "Fast codebase exploration, pattern matching"
    triggers: [/explore, /find, /grep, /search]
    routing:
      - ollama/llama3.1:8b
      - google/gemini-2.5-flash

  # ─── Review & Quality ───
  
  reviewer:
    path: reviewer.md
    description: "Code review, PR feedback, quality checks"
    triggers: [/review, /check, /pr]
    routing:
      - ollama/llama3.1:70b
      - anthropic/claude-sonnet-4-5

  # ─── Utilities ───
  
  quick:
    path: quick.md
    description: "Fast responses, simple questions"
    triggers: [/q, /quick, /fast]
    routing:
      - ollama/llama3.1:8b
      - ollama/qwen2.5-coder:32b
      - anthropic/claude-haiku-4-5

  writer:
    path: writer.md
    description: "Documentation, READMEs, technical writing"
    triggers: [/write, /doc, /readme]
    routing:
      - google/gemini-3-pro
      - anthropic/claude-sonnet-4-5

  refactor:
    path: refactor.md
    description: "Code refactoring, cleanup, optimization"
    triggers: [/refactor, /cleanup, /optimize]
    routing:
      - anthropic/claude-sonnet-4-5
      - ollama/deepseek-coder:33b

# ─────────────────────────────────────────────────────────────────
# Plugin Configuration
# ─────────────────────────────────────────────────────────────────
plugin_config:
  oh-my-opencode:
    disabled_agents:
      - oracle
      - librarian
      - explore
      - frontend-ui-ux-engineer
      - document-writer
    disabled_hooks:
      - comment-checker
    
  jj-opencode:
    gate_message: "What are you working on?"
    
  opencode-antigravity-auth:
    max_accounts: 3

# ─────────────────────────────────────────────────────────────────
# MCP Servers (Model Context Protocol)
# ─────────────────────────────────────────────────────────────────
mcp:
  context7:
    enabled: true
    description: "Official documentation lookup"
  websearch_exa:
    enabled: true
    description: "Real-time web search"
  grep_app:
    enabled: true
    description: "GitHub code search"

# ─────────────────────────────────────────────────────────────────
# Custom Commands
# ─────────────────────────────────────────────────────────────────
commands:
  ship:
    description: "Push current work"
    action: vcs.push
  undo:
    description: "Undo last AI action"
    action: vcs.undo
  status:
    description: "Show current state"
    action: vcs.status
  budget:
    description: "Show provider usage"
    action: providers.status

# ─────────────────────────────────────────────────────────────────
# Hooks (lifecycle events)
# ─────────────────────────────────────────────────────────────────
hooks:
  pre_agent:
    - action: vcs.checkpoint
      when: always
  post_agent:
    - action: vcs.commit
      when: files_changed
  on_rate_limit:
    - action: route.fallback
      notify: true
  on_budget_exceeded:
    - action: route.skip_provider
      notify: true

# ─────────────────────────────────────────────────────────────────
# Local Overrides
# ─────────────────────────────────────────────────────────────────
# Create lattice.local.yaml for machine-specific config:
# - API keys (if not using env vars)
# - Machine-specific ollama models
# - Personal budget adjustments
# - Experimental agents
```

### Config Sections

#### `metadata`
Workflow identity for sharing and versioning.

```yaml
name: dpshade-workflow
description: "JJ-first parallel AI development"
version: 1.0.0
```

#### `vcs`
Version control strategy with optional preset overrides.

```yaml
vcs:
  preset: jj-workspace  # jj-workspace | jj-checkpoint | git-stash | none
  config:
    workspace_dir: .workspaces
    gate_enforcement: true
    checkpoint_message: "checkpoint: before {agent}"
    commit_message: "ai({agent}): {summary}"
```

#### `plugins`
Version-pinned plugin list. Lattice installs and manages these.

```yaml
plugins:
  - jj-opencode@1.0.0
  - oh-my-opencode@2.2.0
  - opencode-antigravity-auth@1.1.2
```

#### `providers`
Provider configuration with auth, tier notes, and budgets.

```yaml
providers:
  anthropic:
    env: ANTHROPIC_API_KEY
    tier: pro                    # For your tracking (not enforced)
    local_budget: unlimited
    
  openai:
    env: OPENAI_API_KEY
    local_budget: 50             # Stop at estimated $50
    
  google:
    auth: antigravity            # Delegate to auth plugin
    
  ollama:
    models:                      # Explicitly list available models
      - llama3.1:8b
      - llama3.1:70b
      - deepseek-coder:33b
```

#### `defaults`
Fallback values for agents that don't specify their own.

```yaml
defaults:
  agents_dir: ./agents
  routing:
    - anthropic/claude-sonnet-4-5
    - google/gemini-2.5-flash
    - ollama/llama3.1:70b
```

#### `agents`
Your custom agents. Each specifies:
- `path`: Markdown file with system prompt
- `description`: What the agent does (for documentation)
- `triggers`: Slash commands that invoke this agent
- `routing`: Ordered list of models (fallback by default)

```yaml
agents:
  architect:
    path: architect.md
    description: "High-level design, system architecture"
    triggers: [/architect, /plan, /design]
    routing:
      - anthropic/claude-opus-4-5
      - openai/gpt-5.2
```

For advanced distribution strategies (pattern, weighted, etc.), see [Routing Logic](#routing-logic).

#### `plugin_config`
Pass-through configuration for managed plugins.

```yaml
plugin_config:
  oh-my-opencode:
    disabled_agents: [oracle, librarian]
    disabled_hooks: [comment-checker]
  jj-opencode:
    gate_message: "What are you working on?"
```

#### `mcp`
Model Context Protocol servers to enable.

```yaml
mcp:
  context7:
    enabled: true
    description: "Official documentation lookup"
  websearch_exa:
    enabled: true
  grep_app:
    enabled: true
```

#### `commands`
Custom shortcut commands.

```yaml
commands:
  ship:
    description: "Push current work"
    action: vcs.push
  undo:
    description: "Undo last AI action"
    action: vcs.undo
  budget:
    description: "Show provider usage"
    action: providers.status
```

#### `hooks`
Lifecycle event handlers.

```yaml
hooks:
  pre_agent:
    - action: vcs.checkpoint
      when: always
  post_agent:
    - action: vcs.commit
      when: files_changed
  on_rate_limit:
    - action: route.fallback
      notify: true
  on_budget_exceeded:
    - action: route.skip_provider
      notify: true
```

| Hook | When |
|------|------|
| `pre_agent` | Before any agent runs |
| `post_agent` | After agent completes |
| `on_rate_limit` | Provider returns 429 |
| `on_budget_exceeded` | Local budget estimate exceeded |

#### `lattice.local.yaml`
Machine-specific overrides (not committed):

```yaml
# lattice.local.yaml
providers:
  ollama:
    models:
      - llama3.1:8b       # Only have 8B on this machine

agents:
  experimental:
    path: experimental.md
    triggers: [/exp]
    routing:
      - ollama/llama3.1:8b
```

---

## Agent Files

### Directory Structure

```
agents/
├── architect.md
├── oracle.md
├── implementer.md
├── frontend.md
├── librarian.md
├── explore.md
├── reviewer.md
├── quick.md
├── writer.md
└── refactor.md
```

### Agent File Format

Agent files are markdown. The entire file becomes the system prompt.

```markdown
<!-- agents/architect.md -->

You are a senior software architect. Your role is to:

1. Design systems at the right level of abstraction
2. Make technology choices with clear tradeoffs
3. Create implementation plans that can be executed incrementally
4. Identify risks and edge cases early

## Principles

- Prefer simple solutions over clever ones
- Design for change, not for prediction
- Make the easy path the right path
- Document decisions, not just outcomes

## Output Format

When designing, provide:
1. **Summary** — One paragraph overview
2. **Key Decisions** — What and why
3. **Components** — The pieces and their responsibilities  
4. **Implementation Order** — What to build first
5. **Open Questions** — What needs more info

## Constraints

- No unnecessary abstraction
- No premature optimization
- No "it depends" without specifics
```

### Optional Frontmatter

For additional metadata (optional):

```markdown
---
model_preference: claude-opus  # Hint, not override
temperature: 0.7
max_tokens: 4000
---

You are a senior software architect...
```

---

## Commands

### Setup

```bash
lattice init                          # Create lattice.yaml template
lattice init --from dpshade/workflow  # Clone someone's workflow
lattice init --from ./path/to/repo    # Clone from local path
lattice validate                      # Check config, agents exist, plugins available
lattice generate                      # Output opencode.json, oh-my-opencode.json, etc.
```

### Plugin Management

```bash
lattice plugins           # List installed + available updates
lattice plugins sync      # Install plugins from lattice.yaml
lattice plugins add <name>@<version>
lattice plugins update    # Update all to latest
```

### Status

```bash
lattice status            # Full status: providers, agents, VCS
lattice status providers  # Provider usage, budget remaining
lattice status agents     # List agents + triggers
```

### VCS (passthrough to preset)

```bash
lattice vcs status        # jj status / git status
lattice vcs undo          # jj undo / git reset
lattice vcs push          # jj_push / git push
```

### Debug

```bash
lattice route "/architect"  # Dry-run: show routing decision
lattice config              # Show resolved config
lattice routing             # Show routing state for all agents
lattice routing reset       # Reset all pattern indexes to 0
```

### Routing State

```bash
lattice routing

# implementer (pattern 3:1)
#   Position: 2/4
#   Next model: anthropic/claude-sonnet-4-5
#   Calls today: 47
#
# quick (pattern 3:1)  
#   Position: 0/4
#   Next model: ollama/llama3.1:8b
#   Calls today: 123
#
# experimental (weighted 50:50)
#   Distribution: claude=17, gemini=14
#   Calls today: 31
```

---

## VCS Presets

### `jj-workspace` (Recommended)

Uses jj-opencode plugin for full workspace workflow.

| Feature | Behavior |
|---------|----------|
| Gate enforcement | Must describe before editing |
| Workspaces | Created per task, auto-cleaned on push |
| Parallel development | Multiple terminals, independent workspaces |
| Rollback | `jj_undo()` |

```yaml
vcs:
  preset: jj-workspace
```

### `jj-checkpoint`

Raw JJ without gates. Simpler, less ceremony.

| Feature | Behavior |
|---------|----------|
| Gate enforcement | None |
| Checkpointing | `jj new` before each agent call |
| Workspaces | None (single working copy) |
| Rollback | `jj undo` |

```yaml
vcs:
  preset: jj-checkpoint
```

### `git-stash`

For teams not ready for JJ.

| Feature | Behavior |
|---------|----------|
| Checkpointing | Auto-stash before agent, commit on temp branch |
| Rollback | `git reset HEAD~1` |
| Cleanup | Manual |

```yaml
vcs:
  preset: git-stash
```

### `none`

No VCS integration. You manage everything.

```yaml
vcs:
  preset: none
```

---

## Routing Logic

Routing is not just "fallback on error"—it's **distribution strategy**. Lattice lets you control exactly how prompts are distributed across models.

### Routing Strategies

#### `fallback` (Simple)

Try models in order. Only use next if current fails.

```yaml
agents:
  architect:
    routing:
      strategy: fallback
      models:
        - anthropic/claude-opus-4-5   # Try first
        - openai/gpt-5.2               # Only if opus fails
```

#### `pattern` (Precise Distribution)

Explicit sequence that repeats. Full control over distribution.

```yaml
agents:
  implementer:
    routing:
      strategy: pattern
      pattern:
        - anthropic/claude-sonnet-4-5   # Call 1
        - anthropic/claude-sonnet-4-5   # Call 2
        - anthropic/claude-sonnet-4-5   # Call 3
        - openai/gpt-4o                  # Call 4
        # Repeats: 5=claude, 6=claude, 7=claude, 8=gpt...
      on_unavailable: next
```

**Use cases:**
- Maximize Pro subscription: 4 Claude, 1 GPT (burn subscription first)
- Quality checkpoints: 3 fast/cheap, 1 expensive for verification
- A/B testing: alternate between models

#### `weighted` (Probabilistic)

Random selection based on weights. Good for load distribution.

```yaml
agents:
  general:
    routing:
      strategy: weighted
      weights:
        anthropic/claude-sonnet-4-5: 75   # 75% of calls
        openai/gpt-4o: 25                  # 25% of calls
      track: true  # Log selections for analysis
```

#### `round_robin` (Equal Distribution)

Cycle through models equally.

```yaml
agents:
  experimental:
    routing:
      strategy: round_robin
      models:
        - anthropic/claude-sonnet-4-5
        - openai/gpt-4o
        - google/gemini-2.5-pro
      # Cycles: claude, gpt, gemini, claude, gpt, gemini...
```

#### `burst` (Iteration vs Final)

Cheap model for rapid iteration, expensive for final output.

```yaml
agents:
  drafter:
    routing:
      strategy: burst
      iterate: ollama/llama3.1:8b        # Fast iterations
      final: anthropic/claude-opus-4-5   # Quality final
      burst_size: 5                       # Switch after 5 iterations
      final_trigger: "finalize"           # Or explicit user command
```

### Real-World Examples

**Maximize Pro subscription, minimize OpenAI spend:**
```yaml
agents:
  implementer:
    routing:
      strategy: pattern
      pattern:
        - anthropic/claude-sonnet-4-5
        - anthropic/claude-sonnet-4-5
        - anthropic/claude-sonnet-4-5
        - anthropic/claude-sonnet-4-5
        - openai/gpt-4o  # 1 in 5 to spread load when needed
```

**Free-first with periodic quality check:**
```yaml
agents:
  quick:
    routing:
      strategy: pattern
      pattern:
        - ollama/llama3.1:8b
        - ollama/llama3.1:8b
        - ollama/llama3.1:8b
        - anthropic/claude-haiku-4-5  # Every 4th for quality
```

**A/B testing models:**
```yaml
agents:
  experimental:
    routing:
      strategy: weighted
      weights:
        anthropic/claude-sonnet-4-5: 50
        google/gemini-2.5-pro: 50
      track: true  # Enable comparison analysis
```

**Quality-critical (no cheap fallback):**
```yaml
agents:
  architect:
    routing:
      strategy: fallback
      models:
        - anthropic/claude-opus-4-5
        - openai/gpt-5.2
      # No cheap models—quality matters more than cost
```

### Handling Unavailability

When the scheduled model is unavailable (rate-limited, down, budget exceeded):

```yaml
routing:
  strategy: pattern
  pattern:
    - anthropic/claude-sonnet-4-5
    - anthropic/claude-sonnet-4-5
    - openai/gpt-4o
    
  on_unavailable: next      # Skip to next in pattern
  # OR
  on_unavailable: retry     # Stay on this slot, retry next call
  # OR
  on_unavailable: fallback  # Use fallback_models list
  
  fallback_models:          # Used when on_unavailable: fallback
    - ollama/llama3.1:70b
```

### State Tracking

Lattice tracks routing state per agent:

```
~/.local/share/lattice/state.json

{
  "routing_state": {
    "implementer": {
      "strategy": "pattern",
      "pattern_index": 2,
      "call_count": 47,
      "last_model": "anthropic/claude-sonnet-4-5"
    },
    "quick": {
      "strategy": "pattern",
      "pattern_index": 0,
      "call_count": 123,
      "last_model": "ollama/llama3.1:8b"
    },
    "experimental": {
      "strategy": "weighted",
      "call_count": 31,
      "distribution": {
        "anthropic/claude-sonnet-4-5": 17,
        "google/gemini-2.5-pro": 14
      }
    }
  },
  "provider_usage": {
    "anthropic": { "calls_today": 89, "estimated_tokens": 245000 },
    "openai": { "calls_today": 12, "estimated_spend": 2.40 },
    "ollama": { "calls_today": 156 }
  }
}
```

### Routing Algorithm

```
function route(agent):
    strategy = agent.routing.strategy
    
    if strategy == "pattern":
        index = state.get_pattern_index(agent)
        model = agent.routing.pattern[index]
        state.increment_pattern_index(agent)
        
    elif strategy == "weighted":
        model = weighted_random(agent.routing.weights)
        
    elif strategy == "round_robin":
        index = state.get_call_count(agent) % len(agent.routing.models)
        model = agent.routing.models[index]
        
    elif strategy == "burst":
        if state.burst_count(agent) < agent.routing.burst_size:
            model = agent.routing.iterate
        else:
            model = agent.routing.final
            
    elif strategy == "fallback":
        model = first_available(agent.routing.models)
    
    provider, model_name = parse(model)
    
    if not available(provider, model_name):
        return handle_unavailable(agent, model)
    
    state.record_call(agent, provider, model_name)
    return (provider, model_name)
```

### Why Distribution Matters

| Scenario | Strategy | Rationale |
|----------|----------|-----------|
| Pro subscription | `pattern` 4:1 | Maximize value from flat-rate tier |
| Budget-conscious | `pattern` with local-heavy | Use free models, spot-check with paid |
| Reliability | `fallback` | Guarantee something works |
| Experimentation | `weighted` 50:50 | Compare model quality |
| Speed + Quality | `burst` | Fast iteration, polished final |

### Data Limitations

**What we CAN'T do (yet):**
- Real-time provider utilization (no APIs for this)
- Automatic "maximize subscription" based on actual quota

**What we CAN do:**
- Precise distribution patterns (you define the ratio)
- Local usage tracking (calls, estimated tokens/spend)
- Hard local caps (`local_budget: 50`)
- Fallback on rate-limit/error
- State persistence across sessions

---

## MCP Integration

Model Context Protocol servers extend agent capabilities with external tools.

### Configuration

```yaml
mcp:
  context7:
    enabled: true
    description: "Official documentation lookup"
    
  websearch_exa:
    enabled: true
    description: "Real-time web search"
    
  grep_app:
    enabled: true
    description: "GitHub code search"
    
  custom_server:
    enabled: true
    command: "node ./mcp/my-server.js"
    env:
      API_KEY: "${MY_API_KEY}"
```

### How It Works

Lattice generates MCP configuration for opencode:
- Enabled servers are wired into the runtime
- Server configs are passed through
- Custom servers can be defined inline

### Common MCP Servers

| Server | Purpose |
|--------|---------|
| `context7` | Official library documentation |
| `websearch_exa` | Real-time web search |
| `grep_app` | GitHub code search |
| `filesystem` | File system access |
| `memory` | Persistent memory |

---

## Hooks

Lifecycle events for automation and integration.

### Available Hooks

| Hook | Trigger | Use Cases |
|------|---------|-----------|
| `pre_agent` | Before any agent runs | Checkpoint, context setup |
| `post_agent` | After agent completes | Commit, notifications |
| `on_rate_limit` | Provider returns 429 | Fallback, alerting |
| `on_budget_exceeded` | Local budget estimate exceeded | Skip provider, warn |
| `on_error` | Agent or tool error | Logging, recovery |

### Configuration

```yaml
hooks:
  pre_agent:
    - action: vcs.checkpoint
      when: always
      
  post_agent:
    - action: vcs.commit
      when: files_changed
    - action: notify.slack
      when: agent == "architect"
      channel: "#designs"
      
  on_rate_limit:
    - action: route.fallback
      notify: true
      
  on_budget_exceeded:
    - action: route.skip_provider
      notify: true
    - action: log.warning
      message: "Budget exceeded for {provider}"
```

### Built-in Actions

| Action | Description |
|--------|-------------|
| `vcs.checkpoint` | Create VCS checkpoint |
| `vcs.commit` | Commit changes |
| `vcs.push` | Push to remote |
| `route.fallback` | Move to next model in routing |
| `route.skip_provider` | Skip provider for this session |
| `notify.terminal` | Print notification |
| `notify.slack` | Send Slack message (if configured) |
| `log.info/warning/error` | Log message |

### Conditions

```yaml
when: always                    # Always run
when: files_changed             # Only if files were modified
when: agent == "architect"      # Only for specific agent
when: provider == "openai"      # Only for specific provider
when: error_count > 3           # After multiple failures
```

---

## Plugin Management

### Philosophy

Lattice doesn't reimplement plugins—it manages them.

```
Without lattice:
  ~/.config/opencode/
  ├── opencode.json          # Manual
  ├── oh-my-opencode.json    # Manual
  ├── package.json           # Manual npm install
  └── (scattered env vars)

With lattice:
  lattice.yaml               # One file
  lattice generate           # Outputs everything
  lattice plugins sync       # Installs correct versions
```

### Version Pinning

```yaml
plugins:
  - jj-opencode@1.0.0
  - oh-my-opencode@2.2.0
```

Pin versions for reproducibility. `lattice plugins update` shows available updates.

### Plugin Discovery

Lattice reads from:
- npm registry (primary)
- GitHub releases (fallback)
- Local paths (for development)

```yaml
plugins:
  - jj-opencode@1.0.0                    # npm
  - github:dpshade/my-plugin@v0.1.0      # GitHub
  - file:../my-local-plugin              # Local dev
```

---

## Workflow Sharing

### The Shareable Unit

A lattice workflow is a Git repo containing:

```
dpshade/ai-workflow/
├── lattice.yaml          # The manifest
├── agents/
│   ├── architect.md
│   ├── implementer.md
│   └── reviewer.md
└── README.md             # Optional: explain the philosophy
```

### The Manifest

```yaml
# lattice.yaml

name: dpshade-workflow
description: "JJ-first parallel AI development with cost-aware routing"
version: 1.0.0
author: dpshade

vcs:
  preset: jj-workspace

plugins:
  - jj-opencode@1.0.0
  - oh-my-opencode@2.2.0

providers:
  anthropic:
    env: ANTHROPIC_API_KEY
  openai:
    env: OPENAI_API_KEY
    local_budget: 50
  ollama:
    # local

defaults:
  agents_dir: ./agents
  routing:
    strategy: fallback
    models:
      - anthropic/claude-sonnet-4-5
      - ollama/llama3.1:70b

agents:
  architect:
    path: architect.md
    triggers: ["/architect", "/plan"]
    routing:
      strategy: fallback
      models:
        - anthropic/claude-opus-4-5
        - openai/gpt-5.2
        
  implementer:
    path: implementer.md
    triggers: ["/implement", "/code"]
    routing:
      strategy: pattern
      pattern:
        - anthropic/claude-sonnet-4-5
        - anthropic/claude-sonnet-4-5
        - anthropic/claude-sonnet-4-5
        - openai/gpt-4o
```

### Clone Flow

```bash
$ lattice init --from dpshade/ai-workflow

Cloning dpshade/ai-workflow...
  ✓ Downloaded lattice.yaml
  ✓ Downloaded 3 agent files
  
Installing plugins...
  ✓ jj-opencode@1.0.0
  ✓ oh-my-opencode@2.2.0
  
Checking providers...
  ✓ ANTHROPIC_API_KEY found
  ✓ OPENAI_API_KEY found
  ✓ ollama running locally
  
Generating configs...
  ✓ opencode.json
  ✓ oh-my-opencode.json
  
Ready! Run `lattice status` to see your setup.
```

### Sources

```bash
# GitHub (default)
lattice init --from dpshade/ai-workflow
lattice init --from github:dpshade/ai-workflow

# GitLab
lattice init --from gitlab:user/workflow

# Local path
lattice init --from ./my-workflow
lattice init --from ~/dotfiles/lattice

# URL
lattice init --from https://example.com/workflow.git
```

### Customization After Clone

```bash
# Clone as starting point
lattice init --from dpshade/ai-workflow

# Customize locally
vim lattice.yaml              # Edit routing, add agents
vim agents/my-agent.md        # Add your own agent

# Re-generate
lattice generate
```

### Workflow Publishing (Future)

```bash
# Create shareable workflow
lattice publish

# Creates:
# - GitHub repo with lattice.yaml + agents/
# - Optional: registry listing
```

### The Network Effect

If lattice becomes the standard:

```
every-ai-coding-repo/
├── lattice.yaml          # Workflow included
├── src/
└── README.md
```

**Adoption signals:**
- oh-my-opencode has 1k+ stars — people want curated setups
- jj-opencode solves a real workflow problem
- AI coding is exploding, tooling is fragmented
- No standard exists for "portable AI workflow"

**Risks:**
- Tool churn is extreme (Cursor, Claude Code, opencode, Aider, Windsurf...)
- Workflows might be too personal to share meaningfully
- Market might want "one opinionated solution" not "compose your own"

---

## Build Plan

### Week 1: Config + Plugin Management

- [ ] Config parser (`lattice.yaml` → structs)
- [ ] Metadata section (name, description, version)
- [ ] `lattice init` — Generate template
- [ ] `lattice init --from` — Clone workflow from repo
- [ ] `lattice validate` — Check everything exists
- [ ] `lattice plugins` — List, add, sync
- [ ] `lattice generate` — Output opencode.json + oh-my-opencode.json

### Week 2: Provider + Routing

- [ ] Provider config parsing (env, auth plugins, local_budget)
- [ ] `lattice status` — Show provider state
- [ ] Routing strategies: fallback, pattern, weighted, round_robin, burst
- [ ] Routing state persistence (`~/.local/share/lattice/state.json`)
- [ ] `lattice routing` — Show current routing state
- [ ] `on_unavailable` handling (next, retry, fallback)
- [ ] Local usage tracking (count calls, estimate tokens)

### Week 3: VCS + Agent Loading + MCP

- [ ] VCS preset wiring (leverage jj-opencode)
- [ ] VCS config overrides (checkpoint_message, commit_message)
- [ ] `lattice vcs status/undo/push`
- [ ] Agent markdown loading
- [ ] Agent descriptions
- [ ] Trigger mapping
- [ ] MCP server configuration
- [ ] MCP config generation

### Week 4: Hooks + Commands + Polish

- [ ] Custom commands parsing
- [ ] Hook system (pre_agent, post_agent, on_rate_limit, on_budget_exceeded)
- [ ] Built-in hook actions
- [ ] `lattice.local.yaml` override loading
- [ ] Error handling
- [ ] `lattice route` (dry-run)
- [ ] README, docs
- [ ] Dogfood with own setup
- [ ] Publish `dpshade/ai-workflow` as reference

---

## Non-Goals

### What Lattice Does NOT Do

| Not This | Why |
|----------|-----|
| Reimplementing LLM API calls | opencode handles this |
| Building a TUI | opencode handles this |
| Auth management | Env vars + auth plugins |
| Real-time provider usage | No reliable APIs for this |
| Curated agent definitions | oh-my-opencode handles this |
| JJ workflow implementation | jj-opencode handles this |
| Being a coding agent | It configures agents, doesn't replace them |
| Locking users in | Workflow files are portable, readable, forkable |

**Lattice is infrastructure.** It orchestrates, configures, routes, and enables sharing. It doesn't reinvent what tools already do well.

### The Line

Lattice should feel like:
- **Docker Compose** — "here's my stack, run it"
- **Terraform** — "declarative, reproducible, versionable"
- **chezmoi** — "my setup, portable"

Lattice should NOT feel like:
- **Another coding agent** — that's opencode's job
- **A walled garden** — lattice.yaml is readable YAML, forkable
- **Opinionated about content** — your agents, your routing, your choice

---

## Open Questions

### Technical

1. **Config location**: Global (`~/.config/lattice/`) vs project-local (`./lattice.yaml`) vs both?
   - Likely: Both, with project overriding global

2. **opencode integration**: Plugin hook vs wrapper vs fork?
   - Likely: Plugin if API allows, wrapper otherwise

3. **Agent file format**: Just markdown? Frontmatter for metadata?
   - Likely: Markdown with optional YAML frontmatter

4. **Plugin registry**: npm only? Custom registry?
   - Likely: npm primary, GitHub fallback

### Strategic

5. **Ecosystem bet vs consumer products**: Is lattice a bigger bet worth making?
   
   | Consumer (Chord Composer) | Infrastructure (Lattice) |
   |---------------------------|--------------------------|
   | Ship and move on | Sustained maintenance |
   | App Store distribution | Ecosystem adoption needed |
   | Revenue from users | Revenue from sponsors/enterprise |
   | Known playbook | New territory |
   | Lower ceiling, lower risk | Higher ceiling, higher risk |

6. **Timing**: Build now or wait for AI coding tools to stabilize?
   - Risk of building on shifting sand (opencode, Aider, etc.)
   - But: early movers define standards

7. **Scope creep**: Where does lattice end?
   - Just config management?
   - Workflow registry/discovery?
   - Team collaboration features?
   - Enterprise/commercial tier?

---

## References

- Lattice — Asset file
- jj-opencode — VCS plugin this builds on
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) — Agent curation layer
- [opencode](https://github.com/opencode-ai/opencode) — Runtime

---

*Created: 2026-01-01*
*Status: Draft*
