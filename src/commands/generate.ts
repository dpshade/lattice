import { existsSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig, type LoadConfigResult } from "../config";
import type { LatticeConfig } from "../schema";

interface OpencodeConfig {
  $schema: string;
  mcpServers?: Record<string, McpServerConfig>;
  providers?: Record<string, ProviderConfig>;
  agents?: Record<string, AgentConfig>;
}

interface McpServerConfig {
  type?: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: string[];
  url?: string;
  headers?: Record<string, string>;
}

interface ProviderConfig {
  apiKey?: string;
  disabled?: boolean;
}

interface AgentConfig {
  model: string;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

interface OhMyOpencodeConfig {
  $schema: string;
  google_auth?: boolean;
  disabled_mcps?: string[];
  disabled_agents?: string[];
  disabled_hooks?: string[];
  agents?: Record<string, { model?: string; temperature?: number }>;
}

// Known MCP servers with their configurations
const KNOWN_MCP_SERVERS: Record<string, McpServerConfig> = {
  context7: {
    type: "sse",
    url: "https://mcp.context7.com/mcp",
  },
  websearch_exa: {
    type: "sse",
    url: "https://mcp.exa.ai",
  },
  grep_app: {
    type: "sse",
    url: "https://mcp.grep.app",
  },
  supermemory: {
    type: "stdio",
    command: "npx",
    args: ["-y", "supermemory"],
  },
  filesystem: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-filesystem"],
  },
  memory: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-memory"],
  },
};

// Comprehensive model mappings: lattice format -> opencode format
const MODEL_MAPPINGS: Record<string, string> = {
  // Anthropic Claude 4 series
  "anthropic/claude-opus-4-5": "claude-4-opus",
  "anthropic/claude-sonnet-4-5": "claude-4-sonnet",
  "anthropic/claude-haiku-4-5": "claude-4-haiku",

  // Anthropic Claude 3.5 series
  "anthropic/claude-3.5-sonnet": "claude-3.5-sonnet",
  "anthropic/claude-3.5-haiku": "claude-3.5-haiku",

  // Anthropic Claude 3 series
  "anthropic/claude-3-opus": "claude-3-opus",
  "anthropic/claude-3-sonnet": "claude-3-sonnet",
  "anthropic/claude-3-haiku": "claude-3-haiku",

  // OpenAI GPT-4 series
  "openai/gpt-4o": "gpt-4o",
  "openai/gpt-4o-mini": "gpt-4o-mini",
  "openai/gpt-4-turbo": "gpt-4-turbo",
  "openai/gpt-4": "gpt-4",

  // OpenAI o-series (reasoning)
  "openai/o1": "o1",
  "openai/o1-mini": "o1-mini",
  "openai/o1-preview": "o1-preview",
  "openai/o3": "o3",
  "openai/o3-mini": "o3-mini",

  // OpenAI GPT-3.5
  "openai/gpt-3.5-turbo": "gpt-3.5-turbo",

  // Google Gemini
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-2.5-pro": "gemini-2.5-pro",
  "google/gemini-2.5": "gemini-2.5",
  "google/gemini-2.0-flash": "gemini-2.0-flash",
  "google/gemini-1.5-pro": "gemini-1.5-pro",
  "google/gemini-1.5-flash": "gemini-1.5-flash",
  "google/gemini-3-pro": "gemini-3-pro",

  // xAI Grok
  "xai/grok-2": "grok-2",
  "xai/grok-3": "grok-3",

  // DeepSeek
  "deepseek/deepseek-chat": "deepseek-chat",
  "deepseek/deepseek-coder": "deepseek-coder",
};

// Agent name mappings: lattice names -> oh-my-opencode names
const AGENT_NAME_MAPPINGS: Record<string, string> = {
  oracle: "oracle",
  librarian: "librarian",
  explore: "explore",
  frontend: "frontend-ui-ux-engineer",
  "frontend-ui-ux": "frontend-ui-ux-engineer",
  writer: "document-writer",
  "document-writer": "document-writer",
  "doc-writer": "document-writer",
  architect: "architect",
  planner: "plan",
  plan: "plan",
  general: "general",
  "code-optimizer": "code-optimizer",
  optimizer: "code-optimizer",
  "test-writer": "test-writer-fixer",
  tester: "test-writer-fixer",
  backend: "backend-architect",
  "backend-architect": "backend-architect",
  mobile: "mobile-app-builder",
  "ai-engineer": "ai-engineer",
};

function generateMcpServers(latticeConfig: LatticeConfig): Record<string, McpServerConfig> | undefined {
  if (!latticeConfig.mcp) return undefined;

  const servers: Record<string, McpServerConfig> = {};

  for (const [name, config] of Object.entries(latticeConfig.mcp)) {
    if (config.enabled === false) continue;

    if (KNOWN_MCP_SERVERS[name]) {
      servers[name] = { ...KNOWN_MCP_SERVERS[name] };
    } else if (config.command) {
      servers[name] = {
        type: "stdio",
        command: config.command,
        env: config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`) : undefined,
      };
    }
  }

  return Object.keys(servers).length > 0 ? servers : undefined;
}

function generateProviders(latticeConfig: LatticeConfig): Record<string, ProviderConfig> | undefined {
  if (!latticeConfig.providers) return undefined;

  const providers: Record<string, ProviderConfig> = {};

  for (const [name, config] of Object.entries(latticeConfig.providers)) {
    if (config.env) {
      providers[name] = { disabled: false };
    }
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
}

function extractModelId(routingSpec: string): string {
  // Check direct mapping first
  if (MODEL_MAPPINGS[routingSpec]) {
    return MODEL_MAPPINGS[routingSpec];
  }

  // Ollama models pass through as-is
  if (routingSpec.startsWith("ollama/")) {
    return routingSpec;
  }

  // Groq models pass through as-is
  if (routingSpec.startsWith("groq/")) {
    return routingSpec;
  }

  // If not mapped and has provider prefix, try extracting just the model part
  if (routingSpec.includes("/")) {
    const [, model] = routingSpec.split("/");
    // Check if model alone is in mappings
    for (const [key, value] of Object.entries(MODEL_MAPPINGS)) {
      if (key.endsWith(`/${model}`)) {
        return value;
      }
    }
  }

  // Return as-is if no mapping found
  return routingSpec;
}

function getFirstModel(
  routing: string[] | { strategy: string; models?: string[]; pattern?: string[]; weights?: Record<string, number> } | undefined
): string | undefined {
  if (!routing) return undefined;

  if (Array.isArray(routing)) {
    return routing[0] ? extractModelId(routing[0]) : undefined;
  }

  if (routing.models) {
    return routing.models[0] ? extractModelId(routing.models[0]) : undefined;
  }

  if (routing.pattern) {
    return routing.pattern[0] ? extractModelId(routing.pattern[0]) : undefined;
  }

  if (routing.weights) {
    const firstModel = Object.keys(routing.weights)[0];
    return firstModel ? extractModelId(firstModel) : undefined;
  }

  return undefined;
}

function generateOpencodeAgents(latticeConfig: LatticeConfig): Record<string, AgentConfig> | undefined {
  const defaultModel = getFirstModel(latticeConfig.defaults?.routing as string[] | undefined);

  const agents: Record<string, AgentConfig> = {};

  if (defaultModel) {
    agents.coder = { model: defaultModel };
  }

  return Object.keys(agents).length > 0 ? agents : undefined;
}

function mapAgentName(latticeName: string): string | undefined {
  return AGENT_NAME_MAPPINGS[latticeName.toLowerCase()] || AGENT_NAME_MAPPINGS[latticeName];
}

function generateOhMyOpencodeConfig(latticeConfig: LatticeConfig): OhMyOpencodeConfig {
  const config: OhMyOpencodeConfig = {
    $schema: "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  };

  const omoConfig = latticeConfig.plugin_config?.["oh-my-opencode"] as Record<string, unknown> | undefined;

  if (omoConfig) {
    if (Array.isArray(omoConfig.disabled_agents)) {
      config.disabled_agents = omoConfig.disabled_agents as string[];
    }
    if (Array.isArray(omoConfig.disabled_hooks)) {
      config.disabled_hooks = omoConfig.disabled_hooks as string[];
    }
    if (Array.isArray(omoConfig.disabled_mcps)) {
      config.disabled_mcps = omoConfig.disabled_mcps as string[];
    }
  }

  if (latticeConfig.agents) {
    const omoAgents: Record<string, { model?: string }> = {};

    for (const [name, agentConfig] of Object.entries(latticeConfig.agents)) {
      const model = getFirstModel(agentConfig.routing as string[] | undefined);
      if (model) {
        const omoName = mapAgentName(name);
        if (omoName) {
          omoAgents[omoName] = { model };
        }
      }
    }

    if (Object.keys(omoAgents).length > 0) {
      config.agents = omoAgents;
    }
  }

  return config;
}

async function installPlugins(plugins: string[], configDir: string): Promise<void> {
  const packageJsonPath = join(configDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    writeFileSync(packageJsonPath, JSON.stringify({
      name: "opencode-plugins",
      private: true,
      dependencies: {}
    }, null, 2));
  }

  for (const plugin of plugins) {
    console.log(`  Installing ${plugin}...`);
    const proc = Bun.spawn(["bun", "add", plugin], {
      cwd: configDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      console.log(`  ✓ Installed ${plugin}`);
    } else {
      const stderr = await new Response(proc.stderr).text();
      console.error(`  ✗ Failed to install ${plugin}: ${stderr}`);
    }
  }
}

export async function generate(): Promise<void> {
  const projectDir = process.cwd();
  const globalConfigDir = join(homedir(), ".config", "opencode");

  let configResult: LoadConfigResult;
  try {
    configResult = loadConfig({ projectDir });
  } catch (error) {
    throw new Error(
      `No lattice.yaml found. Run 'lattice init' first.\n${error instanceof Error ? error.message : ""}`
    );
  }

  const { config, sources } = configResult;
  console.log(`Loaded config from: ${Object.values(sources).filter(Boolean).join(", ")}`);

  const opencodeConfig: OpencodeConfig = {
    $schema: "https://opencode.ai/config.json",
  };

  const mcpServers = generateMcpServers(config);
  if (mcpServers) {
    opencodeConfig.mcpServers = mcpServers;
  }

  const providers = generateProviders(config);
  if (providers) {
    opencodeConfig.providers = providers;
  }

  const agents = generateOpencodeAgents(config);
  if (agents) {
    opencodeConfig.agents = agents;
  }

  const projectOpencodeDir = join(projectDir, ".opencode");
  mkdirSync(projectOpencodeDir, { recursive: true });

  const opencodeJsonPath = join(projectOpencodeDir, "opencode.json");
  writeFileSync(opencodeJsonPath, JSON.stringify(opencodeConfig, null, 2));
  console.log(`  ✓ Generated ${opencodeJsonPath}`);

  const omoConfig = generateOhMyOpencodeConfig(config);

  mkdirSync(globalConfigDir, { recursive: true });
  const omoJsonPath = join(globalConfigDir, "oh-my-opencode.json");

  let existingOmo: OhMyOpencodeConfig = { $schema: omoConfig.$schema };
  if (existsSync(omoJsonPath)) {
    try {
      existingOmo = JSON.parse(readFileSync(omoJsonPath, "utf-8"));
    } catch {
      // Ignore parse errors, start fresh
    }
  }

  const mergedOmo = { ...existingOmo, ...omoConfig };
  writeFileSync(omoJsonPath, JSON.stringify(mergedOmo, null, 2));
  console.log(`  ✓ Generated ${omoJsonPath}`);

  if (config.plugins && config.plugins.length > 0) {
    console.log("\nInstalling plugins...");
    await installPlugins(config.plugins, globalConfigDir);
  }

  console.log("\n✓ Configuration generated successfully!");

  if (mcpServers) {
    console.log(`  MCP servers: ${Object.keys(mcpServers).join(", ")}`);
  }

  if (config.agents) {
    console.log(`  Agents defined: ${Object.keys(config.agents).join(", ")}`);
  }
}
