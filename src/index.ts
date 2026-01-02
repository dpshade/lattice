import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig, ConfigError, type LoadConfigResult } from "./config";
import type { LatticeConfig } from "./schema";

export {
  LatticeConfigSchema,
  VcsPreset,
  PluginRef,
  HookEvent,
  HOOK_EVENTS,
  RoutingConfig,
  SimpleRouting,
  AgentRouting,
  HooksSchema,
  type LatticeConfig,
  type VcsConfig,
  type VcsPresetType,
  type ProviderConfig,
  type AgentConfig,
  type RoutingConfigType,
  type McpServerConfig,
  type CommandConfig,
  type HookAction,
  type HooksConfig,
  type DefaultsConfig,
} from "./schema";

export {
  loadConfig,
  parseConfigString,
  validateConfig,
  ConfigError,
  type LoadConfigOptions,
  type LoadConfigResult,
  type ValidationResult,
} from "./config";

let loadedConfig: LoadConfigResult | null = null;

export function getConfig(): LatticeConfig | null {
  return loadedConfig?.config ?? null;
}

export function getConfigSources(): LoadConfigResult["sources"] | null {
  return loadedConfig?.sources ?? null;
}

export const LatticePlugin: Plugin = async ({ directory }) => {
  try {
    loadedConfig = loadConfig({ projectDir: directory });
    console.log(`[lattice] Loaded config from: ${Object.values(loadedConfig.sources).filter(Boolean).join(", ")}`);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.log(`[lattice] No config found, running without lattice configuration`);
    } else {
      console.error(`[lattice] Error loading config:`, error);
    }
    loadedConfig = null;
  }

  return {
    event: async ({ event }) => {
      if (event.type === "session.created" && loadedConfig) {
        console.log(`[lattice] Session started with workflow: ${loadedConfig.config.name}`);
      }
    },
  };
};

export default LatticePlugin;
