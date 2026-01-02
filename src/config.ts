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

// --- Helper Functions (extracted to reduce cyclomatic complexity) ---

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

    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- Config Loading Helpers ---

interface ConfigLoadState {
  mergedConfig: Record<string, unknown>;
  sources: LoadConfigResult["sources"];
}

function loadGlobalConfig(globalDir: string, state: ConfigLoadState): void {
  const globalPath = findConfigFile(globalDir, CONFIG_FILENAMES);
  if (!globalPath) return;

  const globalConfig = parseYamlFile(globalPath);
  if (isPlainObject(globalConfig)) {
    state.mergedConfig = globalConfig;
    state.sources.global = globalPath;
  }
}

function loadProjectConfig(projectDir: string, state: ConfigLoadState): void {
  const projectPath = findConfigFile(projectDir, CONFIG_FILENAMES);
  if (!projectPath) return;

  const projectConfig = parseYamlFile(projectPath);
  if (isPlainObject(projectConfig)) {
    state.mergedConfig = deepMerge(state.mergedConfig, projectConfig);
    state.sources.project = projectPath;
  }
}

function loadLocalOverrides(projectDir: string, state: ConfigLoadState): void {
  const localPath = findConfigFile(projectDir, LOCAL_OVERRIDE_FILENAMES);
  if (!localPath) return;

  const localConfig = parseYamlFile(localPath);
  if (isPlainObject(localConfig)) {
    state.mergedConfig = deepMerge(state.mergedConfig, localConfig);
    state.sources.local = localPath;
  }
}

function validateMergedConfig(state: ConfigLoadState, projectDir: string, globalDir: string): LatticeConfig {
  if (Object.keys(state.mergedConfig).length === 0 && Object.keys(state.sources).length === 0) {
    throw new ConfigError(
      `No lattice config found. Searched:\n  - ${projectDir}\n  - ${globalDir}`,
      projectDir
    );
  }

  const result = LatticeConfigSchema.safeParse(state.mergedConfig);

  if (!result.success) {
    const errorPath = state.sources.local ?? state.sources.project ?? state.sources.global;
    throw new ConfigError(
      `Invalid lattice config: ${result.error.message}`,
      errorPath,
      result.error.errors
    );
  }

  return result.data;
}

// --- Public API ---

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

  const state: ConfigLoadState = {
    mergedConfig: {},
    sources: {},
  };

  if (!options.skipGlobal) {
    loadGlobalConfig(globalDir, state);
  }

  loadProjectConfig(projectDir, state);

  if (!options.skipLocal) {
    loadLocalOverrides(projectDir, state);
  }

  const config = validateMergedConfig(state, projectDir, globalDir);
  return { config, sources: state.sources };
}

export function parseConfigString(yamlContent: string, filepath?: string): LatticeConfig {
  const parsed = parseYamlSafe(yamlContent, filepath);
  return validateParsedConfig(parsed, filepath);
}

function parseYamlSafe(yamlContent: string, filepath?: string): unknown {
  try {
    return parseYaml(yamlContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Invalid YAML syntax: ${message}`, filepath);
  }
}

function validateParsedConfig(parsed: unknown, filepath?: string): LatticeConfig {
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
