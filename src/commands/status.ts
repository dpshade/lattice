import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig, ConfigError } from "../config";
import { listSnapshots } from "./snapshot";

export async function status(): Promise<void> {
  const projectDir = process.cwd();
  const globalConfigDir = join(homedir(), ".config", "opencode");

  console.log("Lattice Status\n");
  console.log("═".repeat(50));

  // Check for lattice.yaml
  const latticeYamlPath = join(projectDir, "lattice.yaml");
  const latticeYmlPath = join(projectDir, "lattice.yml");
  const hasLatticeConfig = existsSync(latticeYamlPath) || existsSync(latticeYmlPath);

  console.log("\n📁 Configuration Files:");
  console.log(`  lattice.yaml:         ${hasLatticeConfig ? "✓ Found" : "✗ Not found"}`);

  // Try to load and display config
  if (hasLatticeConfig) {
    try {
      const { config, sources } = loadConfig({ projectDir });

      console.log(`  Sources:              ${Object.values(sources).filter(Boolean).join(", ")}`);
      console.log(`\n📋 Workflow: ${config.name}`);
      if (config.description) {
        console.log(`  Description: ${config.description}`);
      }
      if (config.version) {
        console.log(`  Version: ${config.version}`);
      }

      // VCS
      if (config.vcs) {
        console.log(`\n🔄 VCS Preset: ${config.vcs.preset}`);
      }

      // Providers
      if (config.providers) {
        console.log("\n🔌 Providers:");
        for (const [name, providerConfig] of Object.entries(config.providers)) {
          const envVar = providerConfig.env;
          const hasKey = envVar ? !!process.env[envVar] : false;
          const status = hasKey ? "✓ API key set" : envVar ? `✗ ${envVar} not set` : "○ No auth required";
          console.log(`  ${name}: ${status}`);
          if (providerConfig.local_budget) {
            console.log(`    Budget: ${providerConfig.local_budget === "unlimited" ? "unlimited" : `$${providerConfig.local_budget}`}`);
          }
        }
      }

      // Agents
      if (config.agents) {
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

      // MCP Servers
      if (config.mcp) {
        console.log("\n🌐 MCP Servers:");
        for (const [name, mcpConfig] of Object.entries(config.mcp)) {
          const enabled = mcpConfig.enabled !== false;
          console.log(`  ${name}: ${enabled ? "✓ Enabled" : "✗ Disabled"}`);
        }
      }

      // Plugins
      if (config.plugins && config.plugins.length > 0) {
        console.log("\n📦 Plugins:");
        for (const plugin of config.plugins) {
          // Check if installed
          const packageJsonPath = join(globalConfigDir, "package.json");
          let installed = false;
          if (existsSync(packageJsonPath)) {
            try {
              const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
              const pluginName = plugin.split("@")[0];
              installed = !!(packageJson.dependencies?.[pluginName] || packageJson.devDependencies?.[pluginName]);
            } catch {
              // Ignore
            }
          }
          console.log(`  ${plugin}: ${installed ? "✓ Installed" : "○ Not installed"}`);
        }
      }

    } catch (error) {
      if (error instanceof ConfigError) {
        console.log(`\n⚠️  Config Error: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  // Generated configs
  console.log("\n📄 Generated Configs:");
  const opencodeJsonPath = join(projectDir, ".opencode", "opencode.json");
  const omoJsonPath = join(globalConfigDir, "oh-my-opencode.json");

  console.log(`  .opencode/opencode.json:     ${existsSync(opencodeJsonPath) ? "✓ Exists" : "○ Not generated"}`);
  console.log(`  oh-my-opencode.json:         ${existsSync(omoJsonPath) ? "✓ Exists" : "○ Not generated"}`);

  // Backups
  const snapshots = await listSnapshots();
  if (snapshots.length > 0) {
    console.log(`\n💾 Backups: ${snapshots.length} snapshot(s)`);
    console.log(`  Latest: ${snapshots[0]}`);
  }

  console.log("\n" + "═".repeat(50));

  if (!hasLatticeConfig) {
    console.log("\nRun 'lattice init' to create a lattice.yaml");
  } else {
    console.log("\nRun 'lattice generate' to regenerate configs");
  }
}
