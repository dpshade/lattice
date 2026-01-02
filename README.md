# Lattice

> The Dockerfile for AI coding workflows. One config to share your entire setup—agents, models, routing, VCS, plugins—in a single portable file.

---
## Overview

| Field | Value |
|-------|-------|
| **Platform** | GitHub, npm/bun package |
| **Tech Stack** | TypeScript, opencode plugin API |
| **Status** | Idea |
| **Repo** | TBD |

---
## The Problem

Sharing an AI coding workflow today:
1. "Install oh-my-opencode"
2. "Here's my oh-my-opencode.json"
3. "Also install jj-opencode"
4. "Set up these env vars"
5. "Here are my agent markdown files"
6. "Configure your models like this"

**That's a README, not a portable workflow.**

---
## The Solution

```bash
lattice init --from dpshade/ai-workflow
# Done. Their entire setup, working, in one command.
```

---
## Features

- **Portable workflows** — `lattice init --from user/workflow` clones entire setups
- **Single config file** — `lattice.yaml` replaces scattered configs
- **Distribution routing** — Pattern, weighted, round-robin, burst strategies (not just fallback)
- **Plugin management** — Version-pinned plugins with `lattice plugins sync`
- **Opinionated VCS presets** — jj-workspace, jj-checkpoint, git-stash
- **Local usage tracking** — Cost awareness without provider API dependencies
- **Config generation** — `lattice generate` outputs all downstream configs

---
## Revenue

| Metric | Value |
|--------|-------|
| Current Revenue | $0/mo |
| Potential Revenue | $500/mo |

### Revenue Sources

1. **GitHub Sponsors** — Power users sponsor open-source infrastructure they depend on daily. $5-20/mo tier. Realistic: 20-50 sponsors = $100-500/mo
2. **Premium features (future)** — Team sync, cloud usage dashboard, enterprise routing policies. $29/mo. Realistic: 10-20 teams = $290-580/mo
3. **Consulting/setup** — Help teams configure their AI coding infrastructure. $200/session. Realistic: 1-2/mo = $200-400/mo

---
## Marketing

**Primary audience:** Power users running opencode/aider who want to share and adopt reproducible AI coding workflows

**Best channel:** 
- GitHub (discoverable via opencode ecosystem)
- Hacker News ("Dockerfile for AI coding workflows" angle)
- Twitter/X dev circles (AI coding tool optimizers)
- r/LocalLLaMA, r/neovim (power user communities)

**Key message:** "The Dockerfile for AI coding workflows. Share your entire setup in one command."

**Comparable patterns:**
| Before | After | Unit of Sharing |
|--------|-------|-----------------|
| "Install packages, configure nginx..." | `docker-compose up` | docker-compose.yml |
| "Here's my vim config, these plugins..." | `chezmoi apply` | dotfiles repo |
| "Set up this infra, these IAM roles..." | `terraform apply` | .tf files |
| "Install plugins, configure agents..." | `lattice init --from` | lattice.yaml |

---
## Activation Plan

- [ ] Create GitHub repo with README explaining the vision
- [ ] Implement config parser + `lattice init` (Week 1)
- [ ] Add `lattice init --from` for workflow cloning (Week 1)
- [ ] Add plugin management: `lattice plugins sync/add/update` (Week 1)
- [ ] Add provider config + `lattice status` (Week 2)
- [ ] Implement distribution routing (pattern, weighted, etc.) (Week 2)
- [ ] Add `lattice generate` to output opencode configs (Week 3)
- [ ] Wire VCS presets (leverage existing jj-opencode) (Week 3)
- [ ] Dogfood on own setup for 1 week (Week 4)
- [ ] Publish own workflow: `dpshade/ai-workflow` (Week 4)
- [ ] Write docs, record demo, ship v0.1 (Week 4)
- [ ] **48-hour validation**: Post to HN/Twitter, gauge interest

---
## Why This Asset

- **Ecosystem position**: If lattice becomes the standard, you're infrastructure
- **Network effects**: Every shared workflow increases lattice's value
- **Skill leverage**: Deep opencode/JJ expertise, already built jj-opencode
- **Personal pain point**: Currently no way to share workflows portably
- **Moat against ChatGPT**: Infrastructure tooling—ChatGPT can't help
- **Compounds with existing work**: jj-opencode becomes flagship plugin
- **Right timing**: AI coding exploding, tooling fragmented, no standard exists

---
## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Tool churn (opencode dies) | Abstract over multiple backends eventually |
| Workflows too personal | Focus on "starting points" not "final configs" |
| Market wants opinionated solution | lattice enables opinionated workflows to be shared |
| Sustained maintenance needed | Start small, grow with adoption |

---
## Strategic Classification

**This is a bigger bet than Chord Composer.**

| Consumer Products | Infrastructure (Lattice) |
|-------------------|--------------------------|
| Ship and move on | Sustained maintenance |
| App Store discovery | Ecosystem adoption needed |
| Revenue from users | Revenue from sponsors/enterprise |
| Known playbook | New territory |
| Lower ceiling, lower risk | Higher ceiling, higher risk |

**The question:** Developer tooling bet, or stay with consumer products?

---

*Part of 2025-11-25 Dylan Shade Asset Inventory*
