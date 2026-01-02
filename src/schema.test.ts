import { describe, test, expect } from "bun:test";
import { LatticeConfigSchema, PluginRef, VcsPreset, HookEvent } from "./schema";
import { parseConfigString, validateConfig } from "./config";

const FULL_CONFIG_FROM_DESIGN_MD = `
name: dpshade-workflow
description: "JJ-first parallel AI development with cost-conscious routing"
version: 1.0.0

vcs:
  preset: jj-workspace
  config:
    workspace_dir: .workspaces
    gate_enforcement: true
    auto_cleanup: true
    checkpoint_message: "checkpoint: before {agent}"
    commit_message: "ai({agent}): {summary}"

plugins:
  - jj-opencode@1.0.0
  - oh-my-opencode@2.2.0
  - opencode-antigravity-auth@1.1.2
  - opencode-openai-codex-auth@4.1.0

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

defaults:
  agents_dir: ./agents
  routing:
    - anthropic/claude-sonnet-4-5
    - google/gemini-2.5-flash
    - ollama/llama3.1:70b

agents:
  architect:
    path: architect.md
    description: "High-level design, system architecture, technical decisions"
    triggers: [/architect, /design, /plan]
    routing:
      - anthropic/claude-opus-4-5
      - openai/o3
      - anthropic/claude-sonnet-4-5

  quick:
    path: quick.md
    description: "Fast responses, simple questions"
    triggers: [/q, /quick, /fast]
    routing:
      - ollama/llama3.1:8b
      - ollama/qwen2.5-coder:32b
      - anthropic/claude-haiku-4-5

plugin_config:
  oh-my-opencode:
    disabled_agents:
      - oracle
      - librarian
    disabled_hooks:
      - comment-checker
  jj-opencode:
    gate_message: "What are you working on?"

mcp:
  context7:
    enabled: true
    description: "Official documentation lookup"
  websearch_exa:
    enabled: true
    description: "Real-time web search"

commands:
  ship:
    description: "Push current work"
    action: vcs.push
  undo:
    description: "Undo last AI action"
    action: vcs.undo

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

describe("LatticeConfigSchema", () => {
  test("parses full config from DESIGN.md", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    expect(config.name).toBe("dpshade-workflow");
    expect(config.description).toBe("JJ-first parallel AI development with cost-conscious routing");
    expect(config.version).toBe("1.0.0");
  });

  test("validates VCS section", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    expect(config.vcs?.preset).toBe("jj-workspace");
    expect(config.vcs?.config?.workspace_dir).toBe(".workspaces");
    expect(config.vcs?.config?.gate_enforcement).toBe(true);
  });

  test("validates plugins array", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    expect(config.plugins).toHaveLength(4);
    expect(config.plugins?.[0]).toBe("jj-opencode@1.0.0");
  });

  test("validates providers", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    expect(config.providers?.anthropic?.env).toBe("ANTHROPIC_API_KEY");
    expect(config.providers?.anthropic?.local_budget).toBe("unlimited");
    expect(config.providers?.openai?.local_budget).toBe(50);
    expect(config.providers?.ollama?.models).toContain("llama3.1:8b");
  });

  test("validates agents with simple routing", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    expect(config.agents?.architect?.path).toBe("architect.md");
    expect(config.agents?.architect?.triggers).toContain("/architect");
    expect(config.agents?.architect?.routing).toEqual([
      "anthropic/claude-opus-4-5",
      "openai/o3",
      "anthropic/claude-sonnet-4-5",
    ]);
  });

  test("validates plugin_config pass-through", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    const omoConfig = config.plugin_config?.["oh-my-opencode"] as Record<string, unknown>;
    expect(omoConfig?.disabled_agents).toContain("oracle");
  });

  test("validates MCP servers", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    expect(config.mcp?.context7?.enabled).toBe(true);
    expect(config.mcp?.context7?.description).toBe("Official documentation lookup");
  });

  test("validates commands", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    expect(config.commands?.ship?.action).toBe("vcs.push");
  });

  test("validates hooks", () => {
    const config = parseConfigString(FULL_CONFIG_FROM_DESIGN_MD);
    
    expect(config.hooks?.pre_agent?.[0]?.action).toBe("vcs.checkpoint");
    expect(config.hooks?.on_rate_limit?.[0]?.notify).toBe(true);
  });
});

describe("PluginRef validation", () => {
  test("accepts valid plugin refs", () => {
    expect(PluginRef.safeParse("jj-opencode@1.0.0").success).toBe(true);
    expect(PluginRef.safeParse("github:dpshade/my-plugin@v0.1.0").success).toBe(true);
    expect(PluginRef.safeParse("file:../my-local-plugin").success).toBe(true);
  });

  test("accepts scoped npm packages", () => {
    expect(PluginRef.safeParse("@myorg/plugin@1.0.0").success).toBe(true);
    expect(PluginRef.safeParse("@opencode-ai/plugin@1.0.224").success).toBe(true);
  });

  test("rejects invalid plugin refs", () => {
    expect(PluginRef.safeParse("jj-opencode").success).toBe(false);
    expect(PluginRef.safeParse("@1.0.0").success).toBe(false);
  });
});

describe("hooks validation", () => {
  test("rejects unknown hook events", () => {
    expect(() => parseConfigString(`
name: test
hooks:
  invalid_hook:
    - action: do.something
`)).toThrow();
  });
});

describe("error handling", () => {
  test("throws on invalid YAML syntax", () => {
    expect(() => parseConfigString(`
name: test
invalid yaml: [
`)).toThrow(/Invalid YAML/);
  });
});

describe("validateConfig", () => {
  test("returns success for valid config", () => {
    const result = validateConfig(`name: test`);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.config.name).toBe("test");
    }
  });

  test("returns error for invalid config without throwing", () => {
    const result = validateConfig(`invalid: true`);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  test("returns error for invalid YAML without throwing", () => {
    const result = validateConfig(`name: [`);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid YAML");
    }
  });
});

describe("Routing strategies", () => {
  test("pattern strategy", () => {
    const config = parseConfigString(`
name: test
agents:
  implementer:
    path: implementer.md
    routing:
      strategy: pattern
      pattern:
        - anthropic/claude-sonnet-4-5
        - anthropic/claude-sonnet-4-5
        - openai/gpt-4o
      on_unavailable: next
`);
    
    const routing = config.agents?.implementer?.routing as { strategy: string; pattern: string[] };
    expect(routing.strategy).toBe("pattern");
    expect(routing.pattern).toHaveLength(3);
  });

  test("weighted strategy", () => {
    const config = parseConfigString(`
name: test
agents:
  general:
    path: general.md
    routing:
      strategy: weighted
      weights:
        anthropic/claude-sonnet-4-5: 75
        openai/gpt-4o: 25
      track: true
`);
    
    const routing = config.agents?.general?.routing as { strategy: string; weights: Record<string, number> };
    expect(routing.strategy).toBe("weighted");
    expect(routing.weights["anthropic/claude-sonnet-4-5"]).toBe(75);
  });

  test("burst strategy", () => {
    const config = parseConfigString(`
name: test
agents:
  drafter:
    path: drafter.md
    routing:
      strategy: burst
      iterate: ollama/llama3.1:8b
      final: anthropic/claude-opus-4-5
      burst_size: 5
`);
    
    const routing = config.agents?.drafter?.routing as { strategy: string; burst_size: number };
    expect(routing.strategy).toBe("burst");
    expect(routing.burst_size).toBe(5);
  });

  test("round_robin strategy", () => {
    const config = parseConfigString(`
name: test
agents:
  balanced:
    path: balanced.md
    routing:
      strategy: round_robin
      models:
        - anthropic/claude-sonnet-4-5
        - openai/gpt-4o
        - google/gemini-2.5-pro
`);
    
    const routing = config.agents?.balanced?.routing as { strategy: string; models: string[] };
    expect(routing.strategy).toBe("round_robin");
    expect(routing.models).toHaveLength(3);
  });

  test("fallback strategy", () => {
    const config = parseConfigString(`
name: test
agents:
  reliable:
    path: reliable.md
    routing:
      strategy: fallback
      models:
        - anthropic/claude-opus-4-5
        - openai/gpt-5.2
`);
    
    const routing = config.agents?.reliable?.routing as { strategy: string; models: string[] };
    expect(routing.strategy).toBe("fallback");
    expect(routing.models).toEqual(["anthropic/claude-opus-4-5", "openai/gpt-5.2"]);
  });
});

describe("strict mode", () => {
  test("rejects unknown top-level keys", () => {
    expect(() => parseConfigString(`
name: test
unknown_key: value
`)).toThrow();
  });
});

describe("minimal config", () => {
  test("accepts minimal valid config", () => {
    const config = parseConfigString(`name: minimal`);
    expect(config.name).toBe("minimal");
  });
});
