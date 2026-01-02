#!/usr/bin/env bun
import { parseArgs } from "util";
import { init } from "./commands/init";
import { generate } from "./commands/generate";
import { snapshot } from "./commands/snapshot";
import { status } from "./commands/status";
import { exportWorkflow, type ExportFormat } from "./commands/export";

const HELP = `
lattice - The Dockerfile for AI coding workflows

Usage: lattice <command> [options]

Commands:
  init [--from <source>]    Initialize from a workflow (.zip, .yaml, or GitHub)
  export [--format zip|yaml] Export current workflow for sharing
  generate                  Generate opencode.json and oh-my-opencode.json
  snapshot [--name <name>]  Backup current config (for recovery)
  status                    Show current workflow status

Options:
  --help, -h                Show this help message
  --version, -v             Show version

Examples:
  lattice init                           Create a new lattice.yaml template
  lattice init --from workflow.lattice.zip  Install from ZIP
  lattice init --from workflow.yaml      Install from YAML
  lattice init --from dpshade/workflow   Clone from GitHub
  lattice export                         Export as ZIP (default)
  lattice export --format yaml           Export as single YAML file
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
      case "export":
        await handleExport(commandArgs);
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

async function handleExport(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      format: { type: "string", short: "f" },
      name: { type: "string", short: "n" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
  });

  const format = (values.format === "yaml" ? "yaml" : "zip") as ExportFormat;
  await exportWorkflow({ format, name: values.name, output: values.output });
}

main();
