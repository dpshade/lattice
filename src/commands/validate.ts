import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig, ConfigError } from "../config";
import type { LatticeConfig, McpServerConfig } from "../schema";

export interface ValidateOptions {
  quiet?: boolean;
  fix?: boolean; // Future: auto-fix issues
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

type Logger = (msg: string) => void;

// --- Validation Helpers ---

function validateAgentFiles(
  config: LatticeConfig,
  projectDir: string,
  result: ValidationResult,
  log: Logger
): void {
  if (!config.agents) return;

  const agentsDir = config.defaults?.agents_dir || "./agents";
  const resolvedAgentsDir = join(projectDir, agentsDir);

  for (const [name, agentConfig] of Object.entries(config.agents)) {
    const agentPath = join(resolvedAgentsDir, agentConfig.path);
    if (!existsSync(agentPath)) {
      result.errors.push(`Agent file missing: ${agentConfig.path} (agent: ${name})`);
      result.valid = false;
      log(`✗ Agent "${name}": file not found at ${agentPath}`);
    } else {
      log(`✓ Agent "${name}": ${agentConfig.path}`);
    }
  }
}

function validateTriggerCollisions(
  config: LatticeConfig,
  result: ValidationResult,
  log: Logger
): void {
  if (!config.agents) return;

  const triggerMap = new Map<string, string[]>();

  for (const [name, agentConfig] of Object.entries(config.agents)) {
    if (agentConfig.triggers) {
      for (const trigger of agentConfig.triggers) {
        const normalized = trigger.startsWith("/") ? trigger : `/${trigger}`;
        const existing = triggerMap.get(normalized) || [];
        existing.push(name);
        triggerMap.set(normalized, existing);
      }
    }
  }

  for (const [trigger, agents] of triggerMap) {
    if (agents.length > 1) {
      result.warnings.push(`Trigger collision: "${trigger}" used by: ${agents.join(", ")}`);
      log(`⚠ Trigger "${trigger}" used by multiple agents: ${agents.join(", ")}`);
    }
  }
}

function validateProviders(
  config: LatticeConfig,
  result: ValidationResult,
  log: Logger
): void {
  if (!config.providers) return;

  for (const [name, providerConfig] of Object.entries(config.providers)) {
    if (providerConfig.env) {
      const hasEnv = !!process.env[providerConfig.env];
      if (!hasEnv) {
        result.warnings.push(`Provider "${name}": ${providerConfig.env} not set`);
        log(`⚠ Provider "${name}": ${providerConfig.env} not set`);
      } else {
        log(`✓ Provider "${name}": ${providerConfig.env} is set`);
      }
    } else if (providerConfig.auth) {
      log(`✓ Provider "${name}": uses ${providerConfig.auth} auth`);
    } else if (name === "ollama") {
      log(`✓ Provider "${name}": local (no auth required)`);
    }
  }
}

function validateRoutingModels(
  config: LatticeConfig,
  result: ValidationResult,
  log: Logger
): void {
  const modelPattern = /^[\w-]+\/[\w.-]+$/;
  const configuredProviders = new Set(Object.keys(config.providers || {}));

  function checkModel(model: string, context: string): void {
    if (!modelPattern.test(model)) {
      result.warnings.push(`Invalid model format "${model}" in ${context} (expected: provider/model)`);
      log(`⚠ Invalid model format: "${model}" in ${context}`);
      return;
    }

    const [provider] = model.split("/");
    if (configuredProviders.size > 0 && !configuredProviders.has(provider)) {
      result.warnings.push(`Unknown provider "${provider}" in model "${model}" (${context})`);
      log(`⚠ Unknown provider "${provider}" in ${context}`);
    }
  }

  // Check default routing
  if (config.defaults?.routing) {
    const routing = config.defaults.routing;
    if (Array.isArray(routing)) {
      routing.forEach((model) => checkModel(model, "defaults.routing"));
    }
  }

  // Check agent routing
  if (config.agents) {
    for (const [name, agentConfig] of Object.entries(config.agents)) {
      if (agentConfig.routing) {
        const routing = agentConfig.routing;
        if (Array.isArray(routing)) {
          routing.forEach((model) => checkModel(model, `agents.${name}.routing`));
        } else if ("models" in routing && routing.models) {
          routing.models.forEach((model) => checkModel(model, `agents.${name}.routing`));
        } else if ("pattern" in routing && routing.pattern) {
          routing.pattern.forEach((model) => checkModel(model, `agents.${name}.routing`));
        } else if ("weights" in routing && routing.weights) {
          Object.keys(routing.weights).forEach((model) => checkModel(model, `agents.${name}.routing`));
        }
      }
    }
  }
}

function validateMcpServers(
  config: LatticeConfig,
  result: ValidationResult,
  log: Logger
): void {
  if (!config.mcp) return;

  const knownServers = ["context7", "websearch_exa", "grep_app", "supermemory"];

  for (const [name, mcpConfig] of Object.entries(config.mcp)) {
    if (mcpConfig.enabled === false) {
      log(`○ MCP "${name}": disabled`);
      continue;
    }

    if (knownServers.includes(name)) {
      log(`✓ MCP "${name}": known server`);
    } else if (mcpConfig.command) {
      // Custom MCP - check if command exists
      const cmd = mcpConfig.command.split(" ")[0];
      if (cmd.startsWith("./") || cmd.startsWith("/")) {
        const cmdPath = cmd.startsWith("/") ? cmd : join(process.cwd(), cmd);
        if (!existsSync(cmdPath)) {
          result.warnings.push(`MCP "${name}": command not found: ${cmd}`);
          log(`⚠ MCP "${name}": command not found: ${cmd}`);
        } else {
          log(`✓ MCP "${name}": custom server`);
        }
      } else {
        log(`✓ MCP "${name}": custom server (${cmd})`);
      }
    } else {
      result.warnings.push(`MCP "${name}": unknown server with no command`);
      log(`⚠ MCP "${name}": unknown server with no command`);
    }
  }
}

function validateVcsPreset(
  config: LatticeConfig,
  result: ValidationResult,
  log: Logger
): void {
  if (!config.vcs) return;

  const preset = config.vcs.preset;

  if (preset.startsWith("jj-")) {
    // Check if jj is available
    try {
      const proc = Bun.spawnSync(["which", "jj"]);
      if (proc.exitCode !== 0) {
        result.warnings.push(`VCS preset "${preset}" requires jj, but jj is not installed`);
        log(`⚠ VCS preset "${preset}": jj not found in PATH`);
      } else {
        log(`✓ VCS preset "${preset}": jj available`);
      }
    } catch {
      result.warnings.push(`Could not verify jj installation`);
    }
  } else if (preset === "git-stash") {
    log(`✓ VCS preset "${preset}"`);
  } else if (preset === "none") {
    log(`○ VCS preset: none`);
  }
}

async function validatePlugins(
  config: LatticeConfig,
  result: ValidationResult,
  log: Logger
): Promise<void> {
  if (!config.plugins || config.plugins.length === 0) return;

  const globalConfigDir = join(homedir(), ".config", "opencode");
  const packageJsonPath = join(globalConfigDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    result.warnings.push("No plugins installed (run 'lattice plugins sync')");
    log(`⚠ No plugins installed`);
    return;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    for (const plugin of config.plugins) {
      // Parse plugin@version format
      const match = plugin.match(/^(@?[\w-]+\/?[\w-]*)@(.+)$/);
      const pluginName = match ? match[1] : plugin.split("@")[0];
      const requiredVersion = match ? match[2] : undefined;

      const installedVersion = deps[pluginName];

      if (!installedVersion) {
        result.warnings.push(`Plugin "${pluginName}": not installed`);
        log(`⚠ Plugin "${pluginName}": not installed`);
      } else if (requiredVersion && !installedVersion.includes(requiredVersion)) {
        result.info.push(`Plugin "${pluginName}": ${installedVersion} (required: ${requiredVersion})`);
        log(`○ Plugin "${pluginName}": ${installedVersion} (config specifies ${requiredVersion})`);
      } else {
        log(`✓ Plugin "${pluginName}": ${installedVersion}`);
      }
    }
  } catch {
    result.warnings.push("Could not read package.json to verify plugins");
  }
}

// --- Main Validate Function ---

export async function validate(options: ValidateOptions = {}): Promise<ValidationResult> {
  const projectDir = process.cwd();
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: [],
  };
  const log: Logger = options.quiet ? () => {} : console.log;

  log("Validating Lattice configuration...\n");

  // 1. Load and parse config
  let config: LatticeConfig;
  try {
    const loaded = loadConfig({ projectDir });
    config = loaded.config;
    log(`✓ Config loaded: ${loaded.config.name}`);
  } catch (error) {
    if (error instanceof ConfigError) {
      result.errors.push(`Config error: ${error.message}`);
      result.valid = false;
      if (!options.quiet) {
        console.error(`✗ ${error.message}`);
      }
      return result;
    }
    throw error;
  }

  log("");

  // 2. Run all validations
  validateAgentFiles(config, projectDir, result, log);
  validateTriggerCollisions(config, result, log);
  log("");
  validateProviders(config, result, log);
  log("");
  validateRoutingModels(config, result, log);
  log("");
  validateMcpServers(config, result, log);
  log("");
  validateVcsPreset(config, result, log);
  log("");
  await validatePlugins(config, result, log);

  // 3. Summary
  log("\n" + "─".repeat(40));
  if (result.valid && result.warnings.length === 0) {
    log("✓ All validations passed!");
  } else if (result.valid) {
    log(`✓ Config valid with ${result.warnings.length} warning(s)`);
  } else {
    log(`✗ Validation failed with ${result.errors.length} error(s)`);
  }

  return result;
}
