import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { stringify as stringifyYaml } from "yaml";
import { loadConfig, ConfigError } from "../config";
import type { LatticeConfig } from "../schema";

export interface SnapshotOptions {
  name?: string;
}

const CONFIG_LOCATIONS = {
  opencode: join(homedir(), ".config", "opencode"),
  project: process.cwd(),
};

const BACKUP_FILES = [
  "opencode.json",
  "oh-my-opencode.json",
  "package.json",
  "lattice.yaml",
  "lattice.yml",
  "lattice.local.yaml",
  "lattice.local.yml",
];

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function copyDirRecursive(src: string, dest: string) {
  if (!existsSync(src)) return;

  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

interface RuntimeOverrides {
  mcpServers?: Record<string, unknown>;
  providers?: Record<string, unknown>;
  agents?: Record<string, unknown>;
  disabled_agents?: string[];
  disabled_mcps?: string[];
  disabled_hooks?: string[];
}

function readRuntimeOverrides(): RuntimeOverrides {
  const overrides: RuntimeOverrides = {};
  const globalConfigDir = join(homedir(), ".config", "opencode");
  const projectDir = process.cwd();

  // Read oh-my-opencode.json for agent/hook overrides
  const omoGlobalPath = join(globalConfigDir, "oh-my-opencode.json");
  const omoProjectPath = join(projectDir, ".opencode", "oh-my-opencode.json");

  for (const omoPath of [omoGlobalPath, omoProjectPath]) {
    if (existsSync(omoPath)) {
      try {
        const omo = JSON.parse(readFileSync(omoPath, "utf-8"));
        if (omo.disabled_agents) overrides.disabled_agents = omo.disabled_agents;
        if (omo.disabled_mcps) overrides.disabled_mcps = omo.disabled_mcps;
        if (omo.disabled_hooks) overrides.disabled_hooks = omo.disabled_hooks;
        if (omo.agents) {
          overrides.agents = { ...overrides.agents, ...omo.agents };
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Read opencode.json for MCP/provider overrides
  const opcGlobalPath = join(globalConfigDir, "opencode.json");
  const opcProjectPath = join(projectDir, ".opencode", "opencode.json");

  for (const opcPath of [opcGlobalPath, opcProjectPath]) {
    if (existsSync(opcPath)) {
      try {
        const opc = JSON.parse(readFileSync(opcPath, "utf-8"));
        if (opc.mcpServers) {
          overrides.mcpServers = { ...overrides.mcpServers, ...opc.mcpServers };
        }
        if (opc.providers) {
          overrides.providers = { ...overrides.providers, ...opc.providers };
        }
        if (opc.agents) {
          overrides.agents = { ...overrides.agents, ...opc.agents };
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return overrides;
}

function generateFrozenConfig(projectDir: string): string | null {
  // Try to load existing lattice config
  let baseConfig: LatticeConfig | null = null;
  try {
    const result = loadConfig({ projectDir });
    baseConfig = result.config;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // No lattice config exists, we'll create one from runtime state
  }

  // Read runtime overrides from oh-my-opencode.json and opencode.json
  const overrides = readRuntimeOverrides();

  // If no base config and no overrides, nothing to freeze
  if (!baseConfig && Object.keys(overrides).length === 0) {
    return null;
  }

  // Build the frozen config
  const frozen: Record<string, unknown> = baseConfig ? { ...baseConfig } : {
    name: "frozen-workflow",
    description: "Frozen configuration snapshot",
    version: "1.0.0",
  };

  // Merge MCP overrides
  if (overrides.mcpServers) {
    const existingMcp = (frozen.mcp as Record<string, unknown>) || {};
    for (const [name, config] of Object.entries(overrides.mcpServers)) {
      if (!existingMcp[name]) {
        existingMcp[name] = { enabled: true, ...(config as object) };
      }
    }
    frozen.mcp = existingMcp;
  }

  // Apply disabled MCPs
  if (overrides.disabled_mcps && frozen.mcp) {
    const mcpConfig = frozen.mcp as Record<string, Record<string, unknown>>;
    for (const name of overrides.disabled_mcps) {
      if (mcpConfig[name]) {
        mcpConfig[name].enabled = false;
      }
    }
  }

  if (overrides.disabled_agents || overrides.disabled_hooks) {
    const pluginConfig = (frozen.plugin_config as Record<string, unknown>) || {};
    const omoConfig = (pluginConfig["oh-my-opencode"] as Record<string, unknown>) || {};
    
    if (overrides.disabled_agents) {
      omoConfig.disabled_agents = overrides.disabled_agents;
    }
    if (overrides.disabled_hooks) {
      omoConfig.disabled_hooks = overrides.disabled_hooks;
    }
    
    pluginConfig["oh-my-opencode"] = omoConfig;
    frozen.plugin_config = pluginConfig;
  }

  const embedded = embedLocalContent(projectDir);
  if (Object.keys(embedded).length > 0) {
    frozen.embedded = embedded;
  }

  frozen._frozen = {
    timestamp: new Date().toISOString(),
    source: "lattice snapshot",
  };

  return stringifyYaml(frozen, { indent: 2, lineWidth: 0 });
}

function embedLocalContent(projectDir: string): Record<string, Record<string, string>> {
  const embedded: Record<string, Record<string, string>> = {};
  const globalConfigDir = join(homedir(), ".config", "opencode");

  const agentsDirs = [
    join(projectDir, "agents"),
    join(globalConfigDir, "agent"),
  ];
  
  for (const dir of agentsDirs) {
    if (existsSync(dir)) {
      embedded.agents = embedded.agents || {};
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".md")) {
          const name = file.replace(".md", "");
          if (!embedded.agents[name]) {
            embedded.agents[name] = readFileSync(join(dir, file), "utf-8");
          }
        }
      }
    }
  }

  const commandsDirs = [
    join(projectDir, ".opencode", "command"),
    join(globalConfigDir, "command"),
  ];
  
  for (const dir of commandsDirs) {
    if (existsSync(dir)) {
      embedded.commands = embedded.commands || {};
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".md")) {
          const name = file.replace(".md", "");
          if (!embedded.commands[name]) {
            embedded.commands[name] = readFileSync(join(dir, file), "utf-8");
          }
        }
      }
    }
  }

  const skillsDirs = [
    join(projectDir, ".opencode", "skill"),
    join(globalConfigDir, "skill"),
  ];
  
  for (const dir of skillsDirs) {
    if (existsSync(dir)) {
      embedded.skills = embedded.skills || {};
      try {
        for (const skillName of readdirSync(dir)) {
          const skillPath = join(dir, skillName, "SKILL.md");
          if (existsSync(skillPath)) {
            if (!embedded.skills[skillName]) {
              embedded.skills[skillName] = readFileSync(skillPath, "utf-8");
            }
          }
        }
      } catch {
      }
    }
  }

  return embedded;
}

export async function snapshot(options: SnapshotOptions = {}): Promise<string> {
  const timestamp = getTimestamp();
  const snapshotName = options.name || `backup-${timestamp}`;
  const backupDir = join(CONFIG_LOCATIONS.opencode, ".lattice-backups", snapshotName);

  console.log(`Creating snapshot: ${snapshotName}`);

  mkdirSync(backupDir, { recursive: true });

  let backedUp = 0;

  // Backup global config files
  const globalBackupDir = join(backupDir, "global");
  mkdirSync(globalBackupDir, { recursive: true });

  for (const file of BACKUP_FILES) {
    const srcPath = join(CONFIG_LOCATIONS.opencode, file);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, join(globalBackupDir, file));
      console.log(`  ✓ Backed up global ${file}`);
      backedUp++;
    }
  }

  // Backup agents directory if exists
  const agentsDir = join(CONFIG_LOCATIONS.opencode, "agent");
  if (existsSync(agentsDir)) {
    copyDirRecursive(agentsDir, join(globalBackupDir, "agent"));
    console.log(`  ✓ Backed up global agents/`);
    backedUp++;
  }

  // Backup project config files
  const projectBackupDir = join(backupDir, "project");
  mkdirSync(projectBackupDir, { recursive: true });

  for (const file of BACKUP_FILES) {
    const srcPath = join(CONFIG_LOCATIONS.project, file);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, join(projectBackupDir, file));
      console.log(`  ✓ Backed up project ${file}`);
      backedUp++;
    }
  }

  // Backup .opencode directory if exists
  const projectOpencodeDir = join(CONFIG_LOCATIONS.project, ".opencode");
  if (existsSync(projectOpencodeDir)) {
    copyDirRecursive(projectOpencodeDir, join(projectBackupDir, ".opencode"));
    console.log(`  ✓ Backed up project .opencode/`);
    backedUp++;
  }

  // Backup project agents directory if exists
  const projectAgentsDir = join(CONFIG_LOCATIONS.project, "agents");
  if (existsSync(projectAgentsDir)) {
    copyDirRecursive(projectAgentsDir, join(projectBackupDir, "agents"));
    console.log(`  ✓ Backed up project agents/`);
    backedUp++;
  }

  const frozenConfig = generateFrozenConfig(CONFIG_LOCATIONS.project);
  if (frozenConfig) {
    writeFileSync(join(backupDir, "lattice.frozen.yaml"), frozenConfig);
    console.log(`  ✓ Generated lattice.frozen.yaml (complete merged config)`);
    backedUp++;
  }

  if (backedUp === 0) {
    console.log("  No existing config files found to backup.");
  } else {
    console.log(`\n✓ Snapshot saved to: ${backupDir}`);
    console.log(`  Total items backed up: ${backedUp}`);
    if (frozenConfig) {
      console.log(`\n  The lattice.frozen.yaml contains your complete workflow.`);
      console.log(`  Share it with: lattice init --from ${backupDir}/lattice.frozen.yaml`);
    }
  }

  return backupDir;
}

export async function listSnapshots(): Promise<string[]> {
  const backupsDir = join(CONFIG_LOCATIONS.opencode, ".lattice-backups");
  if (!existsSync(backupsDir)) {
    return [];
  }

  return readdirSync(backupsDir)
    .filter((name) => statSync(join(backupsDir, name)).isDirectory())
    .sort()
    .reverse();
}

export async function restoreSnapshot(name: string): Promise<void> {
  const backupsDir = join(CONFIG_LOCATIONS.opencode, ".lattice-backups");
  const snapshotDir = join(backupsDir, name);

  if (!existsSync(snapshotDir)) {
    throw new Error(`Snapshot not found: ${name}`);
  }

  console.log(`Restoring snapshot: ${name}`);

  // Restore global configs
  const globalBackupDir = join(snapshotDir, "global");
  if (existsSync(globalBackupDir)) {
    for (const file of readdirSync(globalBackupDir)) {
      const srcPath = join(globalBackupDir, file);
      const stat = statSync(srcPath);

      if (stat.isDirectory()) {
        copyDirRecursive(srcPath, join(CONFIG_LOCATIONS.opencode, file));
        console.log(`  ✓ Restored global ${file}/`);
      } else {
        copyFileSync(srcPath, join(CONFIG_LOCATIONS.opencode, file));
        console.log(`  ✓ Restored global ${file}`);
      }
    }
  }

  // Restore project configs
  const projectBackupDir = join(snapshotDir, "project");
  if (existsSync(projectBackupDir)) {
    for (const file of readdirSync(projectBackupDir)) {
      const srcPath = join(projectBackupDir, file);
      const stat = statSync(srcPath);

      if (stat.isDirectory()) {
        copyDirRecursive(srcPath, join(CONFIG_LOCATIONS.project, file));
        console.log(`  ✓ Restored project ${file}/`);
      } else {
        copyFileSync(srcPath, join(CONFIG_LOCATIONS.project, file));
        console.log(`  ✓ Restored project ${file}`);
      }
    }
  }

  console.log(`\n✓ Snapshot restored: ${name}`);
}
