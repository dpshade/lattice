import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { stringify as stringifyYaml } from "yaml";
import { loadConfig, ConfigError } from "../config";
import type { LatticeConfig } from "../schema";

export type ExportFormat = "zip" | "yaml";

export interface ExportOptions {
  name?: string;
  format?: ExportFormat;
  output?: string;
}

interface CollectedContent {
  agents: Map<string, string>;
  commands: Map<string, string>;
  skills: Map<string, string>;
}

function collectContent(projectDir: string): CollectedContent {
  const content: CollectedContent = {
    agents: new Map(),
    commands: new Map(),
    skills: new Map(),
  };
  
  const globalConfigDir = join(homedir(), ".config", "opencode");

  const agentsDirs = [
    join(projectDir, "agents"),
    join(globalConfigDir, "agent"),
  ];
  
  for (const dir of agentsDirs) {
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".md")) {
          const name = file.replace(".md", "");
          if (!content.agents.has(name)) {
            content.agents.set(name, readFileSync(join(dir, file), "utf-8"));
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
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".md")) {
          const name = file.replace(".md", "");
          if (!content.commands.has(name)) {
            content.commands.set(name, readFileSync(join(dir, file), "utf-8"));
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
      try {
        for (const skillName of readdirSync(dir)) {
          const skillPath = join(dir, skillName, "SKILL.md");
          if (existsSync(skillPath) && !content.skills.has(skillName)) {
            content.skills.set(skillName, readFileSync(skillPath, "utf-8"));
          }
        }
      } catch {
      }
    }
  }

  return content;
}

function buildFrozenConfig(projectDir: string): Record<string, unknown> {
  let baseConfig: LatticeConfig | null = null;
  try {
    const result = loadConfig({ projectDir });
    baseConfig = result.config;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
  }

  const frozen: Record<string, unknown> = baseConfig ? { ...baseConfig } : {
    name: "exported-workflow",
    description: "Exported workflow configuration",
    version: "1.0.0",
  };

  delete frozen.embedded;
  delete frozen._frozen;

  return frozen;
}

async function exportAsZip(options: ExportOptions, projectDir: string): Promise<string> {
  const name = options.name || "workflow";
  const outputPath = options.output || join(process.cwd(), `${name}.lattice.zip`);
  
  const frozen = buildFrozenConfig(projectDir);
  const content = collectContent(projectDir);
  
  const tempDir = join(homedir(), ".config", "opencode", ".lattice-tmp", `export-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  
  const latticeYaml = stringifyYaml(frozen, { indent: 2 });
  writeFileSync(join(tempDir, "lattice.yaml"), latticeYaml);
  console.log("  ✓ Added lattice.yaml");

  if (content.agents.size > 0) {
    const agentsDir = join(tempDir, "agents");
    mkdirSync(agentsDir, { recursive: true });
    for (const [agentName, agentContent] of content.agents) {
      writeFileSync(join(agentsDir, `${agentName}.md`), agentContent);
    }
    console.log(`  ✓ Added ${content.agents.size} agents`);
  }

  if (content.commands.size > 0) {
    const commandsDir = join(tempDir, "commands");
    mkdirSync(commandsDir, { recursive: true });
    for (const [cmdName, cmdContent] of content.commands) {
      writeFileSync(join(commandsDir, `${cmdName}.md`), cmdContent);
    }
    console.log(`  ✓ Added ${content.commands.size} commands`);
  }

  if (content.skills.size > 0) {
    const skillsDir = join(tempDir, "skills");
    mkdirSync(skillsDir, { recursive: true });
    for (const [skillName, skillContent] of content.skills) {
      const skillSubDir = join(skillsDir, skillName);
      mkdirSync(skillSubDir, { recursive: true });
      writeFileSync(join(skillSubDir, "SKILL.md"), skillContent);
    }
    console.log(`  ✓ Added ${content.skills.size} skills`);
  }

  const proc = Bun.spawn(["zip", "-r", outputPath, "."], {
    cwd: tempDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  
  await proc.exited;
  
  const { rmSync } = await import("fs");
  rmSync(tempDir, { recursive: true, force: true });
  
  return outputPath;
}

async function exportAsYaml(options: ExportOptions, projectDir: string): Promise<string> {
  const name = options.name || "workflow";
  const outputPath = options.output || join(process.cwd(), `${name}.lattice.yaml`);
  
  const frozen = buildFrozenConfig(projectDir);
  const content = collectContent(projectDir);

  if (content.agents.size > 0) {
    frozen.embedded = frozen.embedded || {};
    (frozen.embedded as Record<string, unknown>).agents = Object.fromEntries(content.agents);
    console.log(`  ✓ Embedded ${content.agents.size} agents`);
  }

  if (content.commands.size > 0) {
    frozen.embedded = frozen.embedded || {};
    (frozen.embedded as Record<string, unknown>).commands = Object.fromEntries(content.commands);
    console.log(`  ✓ Embedded ${content.commands.size} commands`);
  }

  if (content.skills.size > 0) {
    frozen.embedded = frozen.embedded || {};
    (frozen.embedded as Record<string, unknown>).skills = Object.fromEntries(content.skills);
    console.log(`  ✓ Embedded ${content.skills.size} skills`);
  }

  const yaml = stringifyYaml(frozen, { indent: 2, lineWidth: 0 });
  writeFileSync(outputPath, yaml);
  
  return outputPath;
}

export async function exportWorkflow(options: ExportOptions = {}): Promise<string> {
  const projectDir = process.cwd();
  const format = options.format || "zip";
  
  console.log(`\nExporting workflow as ${format.toUpperCase()}...\n`);

  let outputPath: string;
  
  if (format === "zip") {
    outputPath = await exportAsZip(options, projectDir);
  } else {
    outputPath = await exportAsYaml(options, projectDir);
  }

  console.log(`\n✓ Exported to: ${outputPath}`);
  console.log(`\nShare with:`);
  console.log(`  lattice init --from ${outputPath}`);
  
  return outputPath;
}
