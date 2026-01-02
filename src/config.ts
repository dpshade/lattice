import { parse as parseYaml } from "yaml";
import { LatticeConfigSchema, type LatticeConfig } from "./schema";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
    public readonly zodErrors?: unknown
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

const CONFIG_FILENAMES = ["lattice.yaml", "lattice.yml"] as const;
const LOCAL_OVERRIDE_FILENAMES = ["lattice.local.yaml", "lattice.local.yml"] as const;

function findConfigFile(dir: string, filenames: readonly string[]): string | null {
  for (const filename of filenames) {
    const filepath = join(dir, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }
  return null;
}

function parseYamlFile(filepath: string): unknown {
  try {
    const content = readFileSync(filepath, "utf-8");
    return parseYaml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Failed to parse ${filepath}: ${message}`, filepath);
  }
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };

  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];

    if (
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === "object" &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>
      );
    } else {
      result[key] = overrideVal;
    }
  }

  return result;
}

export interface LoadConfigOptions {
  projectDir?: string;
  globalDir?: string;
  skipLocal?: boolean;
  skipGlobal?: boolean;
}

export interface LoadConfigResult {
  config: LatticeConfig;
  sources: {
    global?: string;
    project?: string;
    local?: string;
  };
}

export function loadConfig(options: LoadConfigOptions = {}): LoadConfigResult {
  const projectDir = options.projectDir ?? process.cwd();
  const globalDir = options.globalDir ?? join(homedir(), ".config", "lattice");

  const sources: LoadConfigResult["sources"] = {};
  let mergedConfig: Record<string, unknown> = {};

  if (!options.skipGlobal) {
    const globalPath = findConfigFile(globalDir, CONFIG_FILENAMES);
    if (globalPath) {
      const globalConfig = parseYamlFile(globalPath);
      if (globalConfig && typeof globalConfig === "object") {
        mergedConfig = globalConfig as Record<string, unknown>;
        sources.global = globalPath;
      }
    }
  }

  const projectPath = findConfigFile(projectDir, CONFIG_FILENAMES);
  if (projectPath) {
    const projectConfig = parseYamlFile(projectPath);
    if (projectConfig && typeof projectConfig === "object") {
      mergedConfig = deepMerge(mergedConfig, projectConfig as Record<string, unknown>);
      sources.project = projectPath;
    }
  }

  if (!options.skipLocal) {
    const localPath = findConfigFile(projectDir, LOCAL_OVERRIDE_FILENAMES);
    if (localPath) {
      const localConfig = parseYamlFile(localPath);
      if (localConfig && typeof localConfig === "object") {
        mergedConfig = deepMerge(mergedConfig, localConfig as Record<string, unknown>);
        sources.local = localPath;
      }
    }
  }

  if (Object.keys(mergedConfig).length === 0 && Object.keys(sources).length === 0) {
    throw new ConfigError(
      `No lattice config found. Searched:\n  - ${projectDir}\n  - ${globalDir}`,
      projectDir
    );
  }

  const result = LatticeConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const errorPath = sources.local ?? sources.project ?? sources.global;
    throw new ConfigError(
      `Invalid lattice config: ${result.error.message}`,
      errorPath,
      result.error.errors
    );
  }

  return { config: result.data, sources };
}

export function parseConfigString(yamlContent: string, filepath?: string): LatticeConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Invalid YAML syntax: ${message}`, filepath);
  }

  const result = LatticeConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new ConfigError(
      `Invalid lattice config: ${result.error.message}`,
      filepath,
      result.error.errors
    );
  }

  return result.data;
}

export type ValidationResult =
  | { success: true; config: LatticeConfig }
  | { success: false; error: string; zodErrors?: unknown };

export function validateConfig(yamlContent: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Invalid YAML syntax: ${message}` };
  }

  const result = LatticeConfigSchema.safeParse(parsed);

  if (!result.success) {
    return {
      success: false,
      error: result.error.message,
      zodErrors: result.error.errors,
    };
  }

  return { success: true, config: result.data };
}
