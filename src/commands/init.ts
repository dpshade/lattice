import { existsSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { snapshot } from "./snapshot";
import { generate } from "./generate";

export interface InitOptions {
  from?: string;
  force?: boolean;
}

const TEMPLATE = `# lattice.yaml
# The Dockerfile for AI coding workflows
# Learn more: https://github.com/dpshade/lattice

name: my-workflow
description: "My AI coding workflow"
version: 1.0.0

# Version Control Strategy
vcs:
  preset: jj-workspace  # jj-workspace | jj-checkpoint | git-stash | none
  config:
    workspace_dir: .workspaces
    gate_enforcement: true

# Plugins (version-pinned)
plugins:
  - oh-my-opencode@2.3.1
  # - jj-opencode@1.0.0

# Providers
providers:
  anthropic:
    env: ANTHROPIC_API_KEY
    tier: pro
  openai:
    env: OPENAI_API_KEY
    local_budget: 50
  # ollama:
  #   models:
  #     - llama3.1:8b
  #     - llama3.1:70b

# Default routing for agents without explicit routing
defaults:
  agents_dir: ./agents
  routing:
    - anthropic/claude-sonnet-4-5
    - openai/gpt-4o

# Custom Agents
agents:
  architect:
    path: architect.md
    description: "High-level design and architecture"
    triggers: [/architect, /design, /plan]
    routing:
      - anthropic/claude-opus-4-5
      - openai/o3

  quick:
    path: quick.md
    description: "Fast responses for simple questions"
    triggers: [/q, /quick]
    routing:
      - anthropic/claude-haiku-4-5
      - openai/gpt-4o-mini

# MCP Servers
mcp:
  context7:
    enabled: true
    description: "Library documentation lookup"
  websearch_exa:
    enabled: true
    description: "Real-time web search"
  # custom_mcp:
  #   enabled: true
  #   command: "node ./mcp/my-server.js"
  #   env:
  #     API_KEY: "\${MY_API_KEY}"

# Plugin Configuration
plugin_config:
  oh-my-opencode:
    disabled_hooks: []
    # disabled_agents: [oracle]

# Custom Commands
commands:
  ship:
    description: "Push current work"
    action: vcs.push
  undo:
    description: "Undo last action"
    action: vcs.undo

# Lifecycle Hooks
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
`;

const ARCHITECT_AGENT = `You are a senior software architect. Your role is to:

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
`;

const QUICK_AGENT = `You are a fast, efficient assistant for quick questions and simple tasks.

## Behavior

- Answer directly and concisely
- Don't over-explain
- If a question needs deeper analysis, suggest using a more powerful agent
- Prefer one-line answers when appropriate

## Examples

Good response: "Use \`git stash\` to temporarily save changes."
Bad response: "Great question! Let me explain the concept of stashing in Git..."
`;

async function cloneFromGitHub(source: string, targetDir: string): Promise<void> {
  const isGitHubShorthand = /^[\w-]+\/[\w-]+$/.test(source);
  const isGitHubUrl = source.startsWith("github:") || source.includes("github.com");

  let repoUrl: string;
  let repoPath: string;

  if (isGitHubShorthand) {
    repoPath = source;
    repoUrl = `https://github.com/${source}`;
  } else if (source.startsWith("github:")) {
    repoPath = source.replace("github:", "");
    repoUrl = `https://github.com/${repoPath}`;
  } else if (source.includes("github.com")) {
    const match = source.match(/github\.com[/:](.+?)(?:\.git)?$/);
    if (!match) throw new Error(`Invalid GitHub URL: ${source}`);
    repoPath = match[1];
    repoUrl = `https://github.com/${repoPath}`;
  } else {
    throw new Error(`Invalid source: ${source}`);
  }

  console.log(`Fetching workflow from: ${repoUrl}`);

  // Use GitHub API to fetch files
  const apiBase = `https://api.github.com/repos/${repoPath}/contents`;

  // Fetch lattice.yaml
  const latticeResponse = await fetch(`${apiBase}/lattice.yaml`);
  if (!latticeResponse.ok) {
    const latticeYmlResponse = await fetch(`${apiBase}/lattice.yml`);
    if (!latticeYmlResponse.ok) {
      throw new Error(`No lattice.yaml found in ${repoPath}`);
    }
    const data = await latticeYmlResponse.json() as { content: string };
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    writeFileSync(join(targetDir, "lattice.yaml"), content);
  } else {
    const data = await latticeResponse.json() as { content: string };
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    writeFileSync(join(targetDir, "lattice.yaml"), content);
  }
  console.log("  ✓ Downloaded lattice.yaml");

  // Fetch agents directory
  const agentsResponse = await fetch(`${apiBase}/agents`);
  if (agentsResponse.ok) {
    const agentsDir = join(targetDir, "agents");
    mkdirSync(agentsDir, { recursive: true });

    const files = await agentsResponse.json() as Array<{ name: string; download_url: string }>;
    for (const file of files) {
      if (file.name.endsWith(".md")) {
        const fileResponse = await fetch(file.download_url);
        const content = await fileResponse.text();
        writeFileSync(join(agentsDir, file.name), content);
        console.log(`  ✓ Downloaded agents/${file.name}`);
      }
    }
  }
}

async function cloneFromLocal(source: string, targetDir: string): Promise<void> {
  const sourcePath = source.startsWith("file:") ? source.slice(5) : source;
  const absolutePath = sourcePath.startsWith("/") ? sourcePath : join(process.cwd(), sourcePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Source directory not found: ${absolutePath}`);
  }

  console.log(`Copying workflow from: ${absolutePath}`);

  // Copy lattice.yaml
  const latticeYaml = existsSync(join(absolutePath, "lattice.yaml"))
    ? join(absolutePath, "lattice.yaml")
    : join(absolutePath, "lattice.yml");

  if (!existsSync(latticeYaml)) {
    throw new Error(`No lattice.yaml found in ${absolutePath}`);
  }

  copyFileSync(latticeYaml, join(targetDir, "lattice.yaml"));
  console.log("  ✓ Copied lattice.yaml");

  // Copy agents directory
  const agentsDir = join(absolutePath, "agents");
  if (existsSync(agentsDir)) {
    const targetAgentsDir = join(targetDir, "agents");
    mkdirSync(targetAgentsDir, { recursive: true });

    for (const file of readdirSync(agentsDir)) {
      if (file.endsWith(".md")) {
        copyFileSync(join(agentsDir, file), join(targetAgentsDir, file));
        console.log(`  ✓ Copied agents/${file}`);
      }
    }
  }

  // Copy lattice.local.yaml if exists
  const localYaml = join(absolutePath, "lattice.local.yaml");
  if (existsSync(localYaml)) {
    copyFileSync(localYaml, join(targetDir, "lattice.local.yaml"));
    console.log("  ✓ Copied lattice.local.yaml");
  }
}

export async function init(options: InitOptions = {}): Promise<void> {
  const targetDir = process.cwd();
  const latticeYamlPath = join(targetDir, "lattice.yaml");

  // Check if lattice.yaml already exists
  if (existsSync(latticeYamlPath) && !options.force) {
    throw new Error(
      "lattice.yaml already exists. Use --force to overwrite, or run 'lattice generate' to regenerate configs."
    );
  }

  // Create backup before any changes
  console.log("\nBacking up existing configuration...");
  await snapshot({ name: `pre-init-${Date.now()}` });

  if (options.from) {
    // Clone from source
    const source = options.from;
    const isLocal = source.startsWith("file:") || source.startsWith("./") || source.startsWith("/") || source.startsWith("../");

    if (isLocal) {
      await cloneFromLocal(source, targetDir);
    } else {
      await cloneFromGitHub(source, targetDir);
    }
  } else {
    // Create template
    console.log("\nCreating lattice.yaml template...");
    writeFileSync(latticeYamlPath, TEMPLATE);
    console.log("  ✓ Created lattice.yaml");

    // Create agents directory with example agents
    const agentsDir = join(targetDir, "agents");
    if (!existsSync(agentsDir)) {
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, "architect.md"), ARCHITECT_AGENT);
      writeFileSync(join(agentsDir, "quick.md"), QUICK_AGENT);
      console.log("  ✓ Created agents/ with example agents");
    }
  }

  // Generate configs
  console.log("\nGenerating opencode configuration...");
  await generate();

  console.log("\n✓ Lattice initialized successfully!");
  console.log("\nNext steps:");
  console.log("  1. Edit lattice.yaml to customize your workflow");
  console.log("  2. Add agent prompts in agents/");
  console.log("  3. Run 'lattice generate' after making changes");
  console.log("  4. Start opencode to use your workflow");
}
