import { readFileSync, readdirSync, statSync } from "fs";
import { join, basename, extname } from "path";

export interface AgentFrontmatter {
  model?: string;
  description?: string;
  triggers?: string[];
  [key: string]: unknown;
}

export interface ParsedAgent {
  name: string;
  path: string;
  frontmatter: AgentFrontmatter;
  content: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Frontmatter is delimited by --- at the start of the file.
 */
export function parseFrontmatter(content: string): { frontmatter: AgentFrontmatter; content: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content };
  }

  const [, yamlContent, bodyContent] = match;
  const frontmatter = parseSimpleYaml(yamlContent);

  return { frontmatter, content: bodyContent };
}

/**
 * Simple YAML parser for frontmatter.
 * Handles basic key: value pairs and arrays.
 */
function parseSimpleYaml(yaml: string): AgentFrontmatter {
  const result: AgentFrontmatter = {};
  const lines = yaml.split(/\r?\n/);

  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    // Check for array item (starts with -)
    const arrayMatch = line.match(/^\s+-\s*(.+)$/);
    if (arrayMatch && currentKey && currentArray) {
      currentArray.push(arrayMatch[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }

    // Check for key: value pair
    const keyValueMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      
      // Save previous array if exists
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      currentKey = key;

      if (value.trim() === "") {
        // Empty value, might be followed by array
        currentArray = [];
      } else if (value.startsWith("[") && value.endsWith("]")) {
        // Inline array: [item1, item2]
        const items = value.slice(1, -1).split(",").map(s => 
          s.trim().replace(/^["']|["']$/g, "")
        ).filter(Boolean);
        result[key] = items;
        currentKey = null;
      } else {
        // Simple value
        result[key] = value.trim().replace(/^["']|["']$/g, "");
        currentKey = null;
      }
    }
  }

  // Save final array if exists
  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Scan a directory for .md files and parse their frontmatter.
 */
export function scanAgentsDirectory(dirPath: string): ParsedAgent[] {
  const agents: ParsedAgent[] = [];

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isFile() && extname(entry) === ".md") {
        const content = readFileSync(fullPath, "utf-8");
        const { frontmatter, content: body } = parseFrontmatter(content);
        const name = basename(entry, ".md");

        agents.push({
          name,
          path: fullPath,
          frontmatter,
          content: body,
        });
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    return [];
  }

  return agents;
}

/**
 * Scan multiple directories for agents.
 */
export function scanAgentsPaths(paths: string[], baseDir: string): ParsedAgent[] {
  const allAgents: ParsedAgent[] = [];
  const seenNames = new Set<string>();

  for (const path of paths) {
    const fullPath = path.startsWith("/") ? path : join(baseDir, path);
    const agents = scanAgentsDirectory(fullPath);

    for (const agent of agents) {
      // First occurrence wins (earlier paths have priority)
      if (!seenNames.has(agent.name)) {
        seenNames.add(agent.name);
        allAgents.push(agent);
      }
    }
  }

  return allAgents;
}

/**
 * Merge discovered agents with config overrides.
 * Config values override frontmatter values.
 */
export function mergeAgentConfig(
  discovered: ParsedAgent[],
  configAgents: Record<string, { path?: string; model?: string; description?: string; triggers?: string[] }> = {}
): Map<string, { model?: string; description?: string; triggers?: string[]; content: string; path: string }> {
  const merged = new Map<string, { model?: string; description?: string; triggers?: string[]; content: string; path: string }>();

  // Start with discovered agents
  for (const agent of discovered) {
    merged.set(agent.name, {
      model: agent.frontmatter.model,
      description: agent.frontmatter.description,
      triggers: agent.frontmatter.triggers,
      content: agent.content,
      path: agent.path,
    });
  }

  // Apply config overrides
  for (const [name, config] of Object.entries(configAgents)) {
    const existing = merged.get(name);

    if (existing) {
      // Override with config values (only if defined)
      if (config.model !== undefined) existing.model = config.model;
      if (config.description !== undefined) existing.description = config.description;
      if (config.triggers !== undefined) existing.triggers = config.triggers;
    } else if (config.path) {
      // Agent defined in config but not discovered - need to load it
      // This is handled separately as we need the base path
    }
  }

  return merged;
}
