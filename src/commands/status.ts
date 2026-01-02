import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig, ConfigError, type LoadConfigResult } from "../config";
import { listSnapshots } from "./snapshot";
import type { LatticeConfig } from "../schema";

// --- Display Helper Functions (extracted to reduce cyclomatic complexity) ---

function displayWorkflowInfo(config: LatticeConfig, sources: LoadConfigResult["sources"]): void {
  console.log(`  Sources:              ${Object.values(sources).filter(Boolean).join(", ")}`);
  console.log(`\n📋 Workflow: ${config.name}`);
  if (config.description) {
    console.log(`  Description: ${config.description}`);
  }
  if (config.version) {
    console.log(`  Version: ${config.version}`);
  }
}

function displayVcs(config: LatticeConfig): void {
  if (config.vcs) {
    console.log(`\n🔄 VCS Preset: ${config.vcs.preset}`);
  }
}

function displayProviders(config: LatticeConfig): void {
  if (!config.providers) return;

  console.log("\n🔌 Providers:");
  for (const [name, providerConfig] of Object.entries(config.providers)) {
    const envVar = providerConfig.env;
    const hasKey = envVar ? !!process.env[envVar] : false;
    const status = hasKey ? "✓ API key set" : envVar ? `✗ ${envVar} not set` : "○ No auth required";
    console.log(`  ${name}: ${status}`);
    if (providerConfig.local_budget) {
      const budget = providerConfig.local_budget === "unlimited" ? "unlimited" : `$${providerConfig.local_budget}`;
      console.log(`    Budget: ${budget}`);
    }
  }
}

function displayAgents(config: LatticeConfig): void {
  if (!config.agents) return;

  console.log("\n🤖 Agents:");
  for (const [name, agentConfig] of Object.entries(config.agents)) {
    const triggers = agentConfig.triggers?.join(", ") || "none";
    console.log(`  ${name}:`);
    console.log(`    Path: ${agentConfig.path}`);
    console.log(`    Triggers: ${triggers}`);
    if (agentConfig.description) {
      console.log(`    Description: ${agentConfig.description}`);
    }
  }
}

function displayMCPServers(config: LatticeConfig): void {
  if (!config.mcp) return;

  console.log("\n🌐 MCP Servers:");
  for (const [name, mcpConfig] of Object.entries(config.mcp)) {
    const enabled = mcpConfig.enabled !== false;
    console.log(`  ${name}: ${enabled ? "✓ Enabled" : "✗ Disabled"}`);
  }
}

function displayPlugins(config: LatticeConfig, globalConfigDir: string): void {
  if (!config.plugins || config.plugins.length === 0) return;

  console.log("\n📦 Plugins:");
  const packageJsonPath = join(globalConfigDir, "package.json");

  for (const plugin of config.plugins) {
    const installed = isPluginInstalled(plugin, packageJsonPath);
    console.log(`  ${plugin}: ${installed ? "✓ Installed" : "○ Not installed"}`);
  }
}

function isPluginInstalled(plugin: string, packageJsonPath: string): boolean {
  if (!existsSync(packageJsonPath)) return false;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const pluginName = plugin.split("@")[0];
    return !!(packageJson.dependencies?.[pluginName] || packageJson.devDependencies?.[pluginName]);
  } catch {
    return false;
  }
}

function displayGeneratedConfigs(projectDir: string, globalConfigDir: string): void {
  console.log("\n📄 Generated Configs:");
  const opencodeJsonPath = join(projectDir, ".opencode", "opencode.json");
  const omoJsonPath = join(globalConfigDir, "oh-my-opencode.json");

  console.log(`  .opencode/opencode.json:     ${existsSync(opencodeJsonPath) ? "✓ Exists" : "○ Not generated"}`);
  console.log(`  oh-my-opencode.json:         ${existsSync(omoJsonPath) ? "✓ Exists" : "○ Not generated"}`);
}

async function displaySnapshots(): Promise<void> {
  const snapshots = await listSnapshots();
  if (snapshots.length > 0) {
    console.log(`\n💾 Backups: ${snapshots.length} snapshot(s)`);
    console.log(`  Latest: ${snapshots[0]}`);
  }
}

// --- Main Status Function ---

export async function status(): Promise<void> {
  const projectDir = process.cwd();
  const globalConfigDir = join(homedir(), ".config", "opencode");

  console.log("Lattice Status\n");
  console.log("═".repeat(50));

  const hasLatticeConfig = checkLatticeConfig(projectDir);
  console.log("\n📁 Configuration Files:");
  console.log(`  lattice.yaml:         ${hasLatticeConfig ? "✓ Found" : "✗ Not found"}`);

  if (hasLatticeConfig) {
    displayConfigDetails(projectDir, globalConfigDir);
  }

  displayGeneratedConfigs(projectDir, globalConfigDir);
  await displaySnapshots();

  console.log("\n" + "═".repeat(50));
  console.log(hasLatticeConfig
    ? "\nRun 'lattice generate' to regenerate configs"
    : "\nRun 'lattice init' to create a lattice.yaml");
}

function checkLatticeConfig(projectDir: string): boolean {
  return existsSync(join(projectDir, "lattice.yaml")) || existsSync(join(projectDir, "lattice.yml"));
}

function displayConfigDetails(projectDir: string, globalConfigDir: string): void {
  try {
    const { config, sources } = loadConfig({ projectDir });

    displayWorkflowInfo(config, sources);
    displayVcs(config);
    displayProviders(config);
    displayAgents(config);
    displayMCPServers(config);
    displayPlugins(config, globalConfigDir);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.log(`\n⚠️  Config Error: ${error.message}`);
    } else {
      throw error;
    }
  }
}
