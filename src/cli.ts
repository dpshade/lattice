#!/usr/bin/env bun
import { parseArgs } from "util";
import { init } from "./commands/init";
import { generate } from "./commands/generate";
import { snapshot } from "./commands/snapshot";
import { status } from "./commands/status";

const HELP = `
lattice - The Dockerfile for AI coding workflows

Usage: lattice <command> [options]

Commands:
  init [--from <source>]    Initialize lattice.yaml (optionally from a workflow)
  generate                  Generate opencode.json and oh-my-opencode.json from lattice.yaml
  snapshot [--name <name>]  Backup current config before changes
  status                    Show current workflow status

Options:
  --help, -h                Show this help message
  --version, -v             Show version

Examples:
  lattice init                           Create a new lattice.yaml template
  lattice init --from dpshade/workflow   Clone workflow from GitHub
  lattice init --from ./local-workflow   Clone from local directory
  lattice generate                       Generate configs from lattice.yaml
  lattice snapshot                       Backup current configs
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  if (args[0] === "--version" || args[0] === "-v") {
    console.log("lattice v0.1.0");
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case "init":
        await handleInit(commandArgs);
        break;
      case "generate":
        await generate();
        break;
      case "snapshot":
        await handleSnapshot(commandArgs);
        break;
      case "status":
        await status();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

async function handleInit(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      from: { type: "string", short: "f" },
      force: { type: "boolean" },
    },
    allowPositionals: false,
  });

  await init({ from: values.from, force: values.force });
}

async function handleSnapshot(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: "string", short: "n" },
    },
    allowPositionals: false,
  });

  await snapshot({ name: values.name });
}

main();
