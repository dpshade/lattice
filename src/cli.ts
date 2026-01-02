#!/usr/bin/env bun
import { parseArgs } from "util";
import { init } from "./commands/init";
import { generate } from "./commands/generate";
import { snapshot, listSnapshots, restoreSnapshot } from "./commands/snapshot";
import { status } from "./commands/status";
import { validate } from "./commands/validate";
import { plugins, syncPlugins, addPlugin, updatePlugins, listPlugins } from "./commands/plugins";
import { exportWorkflow, type ExportFormat } from "./commands/export";

const HELP = `
lattice - The Dockerfile for AI coding workflows

Usage: lattice <command> [options]

Commands:
  init [--from <source>]     Initialize from a workflow (.zip, .yaml, or GitHub)
  validate                   Validate config, agent files, plugins
  generate                   Generate opencode.json and oh-my-opencode.json
  export [--format zip|yaml] Export current workflow for sharing
  status                     Show current workflow status
  snapshot [--name <name>]   Backup current config (for recovery)
  snapshot restore <name>    Restore a previous snapshot
  plugins                    List plugins
  plugins sync               Install plugins from lattice.yaml
  plugins add <plugin>       Add a plugin
  plugins update             Update all plugins

Options:
  --help, -h                 Show this help message
  --version, -v              Show version

Workflow Portability:
  # Export your setup
  lattice export workflow.zip
  
  # Share with someone
  lattice init --from workflow.zip  # or GitHub: user/workflow

Examples:
  lattice init                           Create new lattice.yaml
  lattice init --from dpshade/workflow   Clone from GitHub
  lattice init --from workflow.zip       Install from exported ZIP
  lattice validate                       Check everything is configured correctly
  lattice export                         Export as ZIP (default)
  lattice plugins sync                   Install plugins from config
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  if (args[0] === "--version" || args[0] === "-v") {
    console.log("lattice v0.2.0");
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case "init":
        await handleInit(commandArgs);
        break;
      case "validate":
        await handleValidate(commandArgs);
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
      case "plugins":
        await handlePlugins(commandArgs);
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

async function handleValidate(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      quiet: { type: "boolean", short: "q" },
    },
    allowPositionals: false,
  });

  const result = await validate({ quiet: values.quiet });
  
  if (!result.valid) {
    process.exit(1);
  }
}

async function handleSnapshot(args: string[]) {
  // Check for subcommands
  if (args[0] === "restore" && args[1]) {
    await restoreSnapshot(args[1]);
    return;
  }

  if (args[0] === "list") {
    const snapshots = await listSnapshots();
    if (snapshots.length === 0) {
      console.log("No snapshots found.");
    } else {
      console.log("Available snapshots:");
      snapshots.forEach(s => console.log(`  ${s}`));
    }
    return;
  }

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

async function handlePlugins(args: string[]) {
  const subcommand = args[0];

  switch (subcommand) {
    case "sync":
      await syncPlugins();
      break;
    case "add":
      if (!args[1]) {
        console.error("Usage: lattice plugins add <plugin>[@version]");
        process.exit(1);
      }
      await addPlugin(args[1]);
      break;
    case "update":
      await updatePlugins();
      break;
    case "list":
    case undefined:
      await listPlugins();
      break;
    default:
      console.error(`Unknown plugins subcommand: ${subcommand}`);
      console.log("Available: sync, add, update, list");
      process.exit(1);
  }
}

main();
