import { z } from "zod";

const RoutingStrategyFallback = z.object({
  strategy: z.literal("fallback"),
  models: z.array(z.string()).min(1),
});

const RoutingStrategyPattern = z.object({
  strategy: z.literal("pattern"),
  pattern: z.array(z.string()).min(1),
  on_unavailable: z.enum(["next", "retry", "fallback"]).optional(),
  fallback_models: z.array(z.string()).optional(),
});

const RoutingStrategyWeighted = z.object({
  strategy: z.literal("weighted"),
  weights: z.record(z.string(), z.number().positive()),
  track: z.boolean().optional(),
});

const RoutingStrategyRoundRobin = z.object({
  strategy: z.literal("round_robin"),
  models: z.array(z.string()).min(1),
});

const RoutingStrategyBurst = z.object({
  strategy: z.literal("burst"),
  iterate: z.string(),
  final: z.string(),
  burst_size: z.number().int().positive(),
  final_trigger: z.string().optional(),
});

const RoutingConfig = z.discriminatedUnion("strategy", [
  RoutingStrategyFallback,
  RoutingStrategyPattern,
  RoutingStrategyWeighted,
  RoutingStrategyRoundRobin,
  RoutingStrategyBurst,
]);

const SimpleRouting = z.array(z.string()).min(1);

const AgentRouting = z.union([SimpleRouting, RoutingConfig]);

export const VcsPreset = z.enum(["jj-workspace", "jj-checkpoint", "git-stash", "none"]);

const VcsConfigOptions = z.object({
  workspace_dir: z.string().optional(),
  gate_enforcement: z.boolean().optional(),
  auto_cleanup: z.boolean().optional(),
  checkpoint_message: z.string().optional(),
  commit_message: z.string().optional(),
});

const VcsSchema = z.object({
  preset: VcsPreset,
  config: VcsConfigOptions.optional(),
});

export const PluginRef = z.string().regex(
  /^(@?[\w-]+\/?[\w-]*@[\w.-]+|github:[\w-]+\/[\w-]+@[\w.-]+|file:.+)$/,
  "Must be name@version, @scope/name@version, github:user/repo@version, or file:path"
);

const ProviderSchema = z.object({
  env: z.string().optional(),
  auth: z.string().optional(),
  tier: z.string().optional(),
  local_budget: z.union([z.number().nonnegative(), z.literal("unlimited")]).optional(),
  models: z.array(z.string()).optional(),
});

const DefaultsSchema = z.object({
  agents_dir: z.string().optional(),
  routing: AgentRouting.optional(),
});

const AgentSchema = z.object({
  path: z.string(),
  description: z.string().optional(),
  triggers: z.array(z.string()).optional(),
  routing: AgentRouting.optional(),
});

const McpServerSchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  command: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const CommandSchema = z.object({
  description: z.string().optional(),
  action: z.string(),
});

const HookActionSchema = z.object({
  action: z.string(),
  when: z.string().optional(),
  notify: z.boolean().optional(),
  message: z.string().optional(),
  channel: z.string().optional(),
});

export const HOOK_EVENTS = [
  "pre_agent",
  "post_agent",
  "on_rate_limit",
  "on_budget_exceeded",
  "on_error",
] as const;

export const HookEvent = z.enum(HOOK_EVENTS);

const HooksSchema = z.object({
  pre_agent: z.array(HookActionSchema).optional(),
  post_agent: z.array(HookActionSchema).optional(),
  on_rate_limit: z.array(HookActionSchema).optional(),
  on_budget_exceeded: z.array(HookActionSchema).optional(),
  on_error: z.array(HookActionSchema).optional(),
}).strict();

export const LatticeConfigSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    version: z.string().optional(),
    author: z.string().optional(),

    vcs: VcsSchema.optional(),
    plugins: z.array(PluginRef).optional(),
    providers: z.record(z.string(), ProviderSchema).optional(),
    defaults: DefaultsSchema.optional(),
    agents: z.record(z.string(), AgentSchema).optional(),
    plugin_config: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    mcp: z.record(z.string(), McpServerSchema).optional(),
    commands: z.record(z.string(), CommandSchema).optional(),
    hooks: HooksSchema.optional(),
  })
  .strict();

export type LatticeConfig = z.infer<typeof LatticeConfigSchema>;
export type VcsConfig = z.infer<typeof VcsSchema>;
export type VcsPresetType = z.infer<typeof VcsPreset>;
export type ProviderConfig = z.infer<typeof ProviderSchema>;
export type AgentConfig = z.infer<typeof AgentSchema>;
export type RoutingConfigType = z.infer<typeof RoutingConfig>;
export type McpServerConfig = z.infer<typeof McpServerSchema>;
export type CommandConfig = z.infer<typeof CommandSchema>;
export type HookAction = z.infer<typeof HookActionSchema>;
export type HooksConfig = z.infer<typeof HooksSchema>;
export type DefaultsConfig = z.infer<typeof DefaultsSchema>;

export { RoutingConfig, SimpleRouting, AgentRouting, HooksSchema };
