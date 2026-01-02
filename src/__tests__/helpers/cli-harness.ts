/**
 * CLI Test Harness for Lattice
 * 
 * Provides isolated test environments with temp directories
 * for testing CLI commands and validating UX.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TestContext {
  dir: string;
  run: (args: string[]) => Promise<RunResult>;
  writeFile: (path: string, content: string) => void;
  readFile: (path: string) => string;
  exists: (path: string) => boolean;
  cleanup: () => void;
}

/**
 * Creates an isolated test environment with its own temp directory
 * and a helper to run lattice CLI commands
 */
export function createTestContext(): TestContext {
  const dir = mkdtempSync(join(tmpdir(), "lattice-test-"));
  
  const run = async (args: string[]): Promise<RunResult> => {
    const cliPath = resolve(process.cwd(), "src/cli.ts");
    const proc = Bun.spawn(["bun", "run", cliPath, ...args], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Isolate from user's real config
        HOME: dir,
        XDG_CONFIG_HOME: join(dir, ".config"),
        // Prevent color codes in output for easier assertions
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
    });
    
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  };
  
  const writeFile = (path: string, content: string) => {
    const fullPath = join(dir, path);
    const parentDir = join(fullPath, "..");
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(fullPath, content);
  };
  
  const readFile = (path: string) => readFileSync(join(dir, path), "utf-8");
  const exists = (path: string) => existsSync(join(dir, path));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  
  return { dir, run, writeFile, readFile, exists, cleanup };
}

/**
 * Assertion helper for validating error message quality
 */
export function assertHelpfulError(stderr: string, expectations: {
  mentionsCommand?: string;
  suggestsAction?: boolean;
  includesPath?: boolean;
}) {
  if (expectations.mentionsCommand) {
    if (!stderr.includes(expectations.mentionsCommand)) {
      throw new Error(`Expected error to mention "${expectations.mentionsCommand}"\nActual: ${stderr}`);
    }
  }
  if (expectations.suggestsAction) {
    if (!/run|try|use/i.test(stderr)) {
      throw new Error(`Expected error to suggest an action\nActual: ${stderr}`);
    }
  }
}

/**
 * Assertion helper for validating success output quality
 */
export function assertSuccessOutput(stdout: string, expectations: {
  hasCheckmarks?: boolean;
  mentionsNextSteps?: boolean;
}) {
  if (expectations.hasCheckmarks) {
    if (!/[✓✔]/.test(stdout)) {
      throw new Error(`Expected output to have checkmarks\nActual: ${stdout}`);
    }
  }
  if (expectations.mentionsNextSteps) {
    if (!/next|then|now/i.test(stdout)) {
      throw new Error(`Expected output to mention next steps\nActual: ${stdout}`);
    }
  }
}
