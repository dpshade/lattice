import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig, ConfigError } from "../config";

export interface PluginsOptions {
  add?: string;
  remove?: string;
  update?: boolean;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function getGlobalConfigDir(): string {
  return join(homedir(), ".config", "opencode");
}

function getPackageJson(): PackageJson {
  const configDir = getGlobalConfigDir();
  const packageJsonPath = join(configDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    return { dependencies: {} };
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return { dependencies: {} };
  }
}

function parsePluginSpec(spec: string): { name: string; version?: string } {
  // Handle formats: name@version, @scope/name@version, github:user/repo@version
  const match = spec.match(/^(@?[\w-]+\/?[\w-]*)(?:@(.+))?$/);
  if (!match) {
    return { name: spec };
  }
  return { name: match[1], version: match[2] };
}

export async function listPlugins(): Promise<void> {
  const projectDir = process.cwd();
  const configDir = getGlobalConfigDir();

  console.log("Lattice Plugins\n");
  console.log("─".repeat(40));

  // Load config to get required plugins
  let requiredPlugins: string[] = [];
  try {
    const { config } = loadConfig({ projectDir });
    requiredPlugins = config.plugins || [];
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
  }

  // Get installed plugins
  const pkg = getPackageJson();
  const installed = { ...pkg.dependencies, ...pkg.devDependencies };

  if (requiredPlugins.length === 0 && Object.keys(installed).length === 0) {
    console.log("\nNo plugins configured or installed.");
    console.log("Add plugins to lattice.yaml or run: lattice plugins add <plugin>@<version>");
    return;
  }

  // Show required plugins
  if (requiredPlugins.length > 0) {
    console.log("\n📋 Required (from lattice.yaml):");
    for (const plugin of requiredPlugins) {
      const { name, version } = parsePluginSpec(plugin);
      const installedVersion = installed[name];
      
      if (installedVersion) {
        const versionMatch = !version || installedVersion.includes(version);
        const status = versionMatch ? "✓" : "⚠";
        console.log(`  ${status} ${name}@${installedVersion}${version && !versionMatch ? ` (want: ${version})` : ""}`);
      } else {
        console.log(`  ✗ ${name}@${version || "latest"} (not installed)`);
      }
    }
  }

  // Show any extra installed plugins
  const requiredNames = new Set(requiredPlugins.map(p => parsePluginSpec(p).name));
  const extraInstalled = Object.entries(installed).filter(([name]) => 
    !requiredNames.has(name) && !name.startsWith("@types/")
  );

  if (extraInstalled.length > 0) {
    console.log("\n📦 Additional installed:");
    for (const [name, version] of extraInstalled) {
      console.log(`  ○ ${name}@${version}`);
    }
  }

  console.log("");
}

export async function syncPlugins(): Promise<void> {
  const projectDir = process.cwd();
  const configDir = getGlobalConfigDir();

  console.log("Syncing plugins from lattice.yaml...\n");

  // Load config
  let plugins: string[];
  try {
    const { config } = loadConfig({ projectDir });
    plugins = config.plugins || [];
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Error: ${error.message}`);
      console.error("Run 'lattice init' first to create a configuration.");
      process.exit(1);
    }
    throw error;
  }

  if (plugins.length === 0) {
    console.log("No plugins specified in lattice.yaml.");
    return;
  }

  // Ensure config dir exists
  mkdirSync(configDir, { recursive: true });

  // Initialize package.json if needed
  const packageJsonPath = join(configDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    writeFileSync(packageJsonPath, JSON.stringify({ 
      name: "opencode-plugins",
      private: true,
      dependencies: {} 
    }, null, 2));
  }

  // Install each plugin
  let installed = 0;
  let failed = 0;

  for (const plugin of plugins) {
    const { name, version } = parsePluginSpec(plugin);
    const spec = version ? `${name}@${version}` : name;

    console.log(`Installing ${spec}...`);
    
    const proc = Bun.spawn(["bun", "add", spec], {
      cwd: configDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      console.log(`  ✓ Installed ${spec}`);
      installed++;
    } else {
      const stderr = await new Response(proc.stderr).text();
      console.error(`  ✗ Failed: ${stderr.trim()}`);
      failed++;
    }
  }

  console.log(`\n${installed} installed, ${failed} failed`);
}

export async function addPlugin(pluginSpec: string): Promise<void> {
  const configDir = getGlobalConfigDir();
  const { name, version } = parsePluginSpec(pluginSpec);
  const spec = version ? `${name}@${version}` : name;

  console.log(`Adding plugin: ${spec}`);

  mkdirSync(configDir, { recursive: true });

  const packageJsonPath = join(configDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    writeFileSync(packageJsonPath, JSON.stringify({ 
      name: "opencode-plugins",
      private: true,
      dependencies: {} 
    }, null, 2));
  }

  const proc = Bun.spawn(["bun", "add", spec], {
    cwd: configDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;

  if (exitCode === 0) {
    console.log(`\n✓ Added ${spec}`);
    console.log(`\nTo persist this, add to your lattice.yaml:`);
    console.log(`  plugins:`);
    console.log(`    - ${spec}`);
  } else {
    console.error(`\n✗ Failed to add ${spec}`);
    process.exit(1);
  }
}

export async function updatePlugins(): Promise<void> {
  const configDir = getGlobalConfigDir();
  const packageJsonPath = join(configDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    console.log("No plugins installed.");
    return;
  }

  console.log("Updating all plugins...\n");

  const proc = Bun.spawn(["bun", "update"], {
    cwd: configDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;

  if (exitCode === 0) {
    console.log("\n✓ Plugins updated");
  } else {
    console.error("\n✗ Update failed");
    process.exit(1);
  }
}

export async function plugins(options: PluginsOptions = {}): Promise<void> {
  if (options.add) {
    await addPlugin(options.add);
  } else if (options.remove) {
    // TODO: Implement remove
    console.log("Remove not yet implemented");
  } else if (options.update) {
    await updatePlugins();
  } else {
    await listPlugins();
  }
}
