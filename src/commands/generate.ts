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
};

function generateMcpServers(latticeConfig: LatticeConfig): Record<string, McpServerConfig> | undefined {
  if (!latticeConfig.mcp) return undefined;

  const servers: Record<string, McpServerConfig> = {};

  for (const [name, config] of Object.entries(latticeConfig.mcp)) {
    if (config.enabled === false) continue;

    // Check if it's a known MCP server
    if (KNOWN_MCP_SERVERS[name]) {
      servers[name] = { ...KNOWN_MCP_SERVERS[name] };
    } else if (config.command) {
      // Custom MCP server
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
    // Only include providers with explicit env var configuration
    // The env var itself is read at runtime, not stored in config
    if (config.env) {
      providers[name] = {
        disabled: false,
      };
    }
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
}

function extractModelId(routingSpec: string): string {
  // Convert lattice model format (provider/model) to opencode format
  // e.g., "anthropic/claude-sonnet-4-5" -> "claude-4-sonnet" (opencode's format)
  const modelMappings: Record<string, string> = {
    "anthropic/claude-opus-4-5": "claude-4-opus",
    "anthropic/claude-sonnet-4-5": "claude-4-sonnet",
    "anthropic/claude-haiku-4-5": "claude-3.5-haiku",
    "openai/gpt-4o": "gpt-4o",
    "openai/gpt-4o-mini": "gpt-4o-mini",
    "openai/o3": "o3",
    "openai/o3-mini": "o3-mini",
    "openai/o1": "o1",
    "google/gemini-2.5-flash": "gemini-2.5-flash",
    "google/gemini-2.5": "gemini-2.5",
  };

  return modelMappings[routingSpec] || routingSpec;
}

function getFirstModel(routing: string[] | { strategy: string; models?: string[]; pattern?: string[] } | undefined): string | undefined {
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

  return undefined;
}

function generateOpencodeAgents(latticeConfig: LatticeConfig): Record<string, AgentConfig> | undefined {
  // Get default routing
  const defaultModel = getFirstModel(latticeConfig.defaults?.routing as string[] | undefined);

  const agents: Record<string, AgentConfig> = {};

  // Set coder agent from defaults
  if (defaultModel) {
    agents.coder = { model: defaultModel };
  }

  return Object.keys(agents).length > 0 ? agents : undefined;
}

function generateOhMyOpencodeConfig(latticeConfig: LatticeConfig): OhMyOpencodeConfig {
  const config: OhMyOpencodeConfig = {
    $schema: "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  };

  // Get plugin config for oh-my-opencode
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

  // Map agent models from lattice to oh-my-opencode format
  if (latticeConfig.agents) {
    const omoAgents: Record<string, { model?: string }> = {};

    for (const [name, agentConfig] of Object.entries(latticeConfig.agents)) {
      const model = getFirstModel(agentConfig.routing as string[] | undefined);
      if (model) {
        // Map lattice agent names to oh-my-opencode agent names
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

function mapAgentName(latticeName: string): string | undefined {
  const mappings: Record<string, string> = {
    oracle: "oracle",
    librarian: "librarian",
    explore: "explore",
    frontend: "frontend-ui-ux-engineer",
    writer: "document-writer",
  };
  return mappings[latticeName];
}

async function installPlugins(plugins: string[], configDir: string): Promise<void> {
  const packageJsonPath = join(configDir, "package.json");
  
  if (!existsSync(packageJsonPath)) {
    writeFileSync(packageJsonPath, JSON.stringify({ dependencies: {} }, null, 2));
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

  // Load lattice config
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

  // Generate opencode.json
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

  // Write opencode.json to project .opencode directory
  const projectOpencodeDir = join(projectDir, ".opencode");
  mkdirSync(projectOpencodeDir, { recursive: true });

  const opencodeJsonPath = join(projectOpencodeDir, "opencode.json");
  writeFileSync(opencodeJsonPath, JSON.stringify(opencodeConfig, null, 2));
  console.log(`  ✓ Generated ${opencodeJsonPath}`);

  // Generate oh-my-opencode.json
  const omoConfig = generateOhMyOpencodeConfig(config);

  // Write to global config (oh-my-opencode reads from ~/.config/opencode/)
  mkdirSync(globalConfigDir, { recursive: true });
  const omoJsonPath = join(globalConfigDir, "oh-my-opencode.json");

  // Merge with existing config if present
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
