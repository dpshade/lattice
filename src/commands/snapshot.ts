import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

export interface SnapshotOptions {
  name?: string;
}

const CONFIG_LOCATIONS = {
  opencode: join(homedir(), ".config", "opencode"),
  project: process.cwd(),
};

const BACKUP_FILES = [
  "opencode.json",
  "oh-my-opencode.json",
  "package.json",
  "lattice.yaml",
  "lattice.yml",
  "lattice.local.yaml",
  "lattice.local.yml",
];

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function copyDirRecursive(src: string, dest: string) {
  if (!existsSync(src)) return;

  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export async function snapshot(options: SnapshotOptions = {}): Promise<string> {
  const timestamp = getTimestamp();
  const snapshotName = options.name || `backup-${timestamp}`;
  const backupDir = join(CONFIG_LOCATIONS.opencode, ".lattice-backups", snapshotName);

  console.log(`Creating snapshot: ${snapshotName}`);

  mkdirSync(backupDir, { recursive: true });

  let backedUp = 0;

  // Backup global config files
  const globalBackupDir = join(backupDir, "global");
  mkdirSync(globalBackupDir, { recursive: true });

  for (const file of BACKUP_FILES) {
    const srcPath = join(CONFIG_LOCATIONS.opencode, file);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, join(globalBackupDir, file));
      console.log(`  ✓ Backed up global ${file}`);
      backedUp++;
    }
  }

  // Backup agents directory if exists
  const agentsDir = join(CONFIG_LOCATIONS.opencode, "agent");
  if (existsSync(agentsDir)) {
    copyDirRecursive(agentsDir, join(globalBackupDir, "agent"));
    console.log(`  ✓ Backed up global agents/`);
    backedUp++;
  }

  // Backup project config files
  const projectBackupDir = join(backupDir, "project");
  mkdirSync(projectBackupDir, { recursive: true });

  for (const file of BACKUP_FILES) {
    const srcPath = join(CONFIG_LOCATIONS.project, file);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, join(projectBackupDir, file));
      console.log(`  ✓ Backed up project ${file}`);
      backedUp++;
    }
  }

  // Backup .opencode directory if exists
  const projectOpencodeDir = join(CONFIG_LOCATIONS.project, ".opencode");
  if (existsSync(projectOpencodeDir)) {
    copyDirRecursive(projectOpencodeDir, join(projectBackupDir, ".opencode"));
    console.log(`  ✓ Backed up project .opencode/`);
    backedUp++;
  }

  // Backup project agents directory if exists
  const projectAgentsDir = join(CONFIG_LOCATIONS.project, "agents");
  if (existsSync(projectAgentsDir)) {
    copyDirRecursive(projectAgentsDir, join(projectBackupDir, "agents"));
    console.log(`  ✓ Backed up project agents/`);
    backedUp++;
  }

  if (backedUp === 0) {
    console.log("  No existing config files found to backup.");
  } else {
    console.log(`\n✓ Snapshot saved to: ${backupDir}`);
    console.log(`  Total items backed up: ${backedUp}`);
  }

  return backupDir;
}

export async function listSnapshots(): Promise<string[]> {
  const backupsDir = join(CONFIG_LOCATIONS.opencode, ".lattice-backups");
  if (!existsSync(backupsDir)) {
    return [];
  }

  return readdirSync(backupsDir)
    .filter((name) => statSync(join(backupsDir, name)).isDirectory())
    .sort()
    .reverse();
}

export async function restoreSnapshot(name: string): Promise<void> {
  const backupsDir = join(CONFIG_LOCATIONS.opencode, ".lattice-backups");
  const snapshotDir = join(backupsDir, name);

  if (!existsSync(snapshotDir)) {
    throw new Error(`Snapshot not found: ${name}`);
  }

  console.log(`Restoring snapshot: ${name}`);

  // Restore global configs
  const globalBackupDir = join(snapshotDir, "global");
  if (existsSync(globalBackupDir)) {
    for (const file of readdirSync(globalBackupDir)) {
      const srcPath = join(globalBackupDir, file);
      const stat = statSync(srcPath);

      if (stat.isDirectory()) {
        copyDirRecursive(srcPath, join(CONFIG_LOCATIONS.opencode, file));
        console.log(`  ✓ Restored global ${file}/`);
      } else {
        copyFileSync(srcPath, join(CONFIG_LOCATIONS.opencode, file));
        console.log(`  ✓ Restored global ${file}`);
      }
    }
  }

  // Restore project configs
  const projectBackupDir = join(snapshotDir, "project");
  if (existsSync(projectBackupDir)) {
    for (const file of readdirSync(projectBackupDir)) {
      const srcPath = join(projectBackupDir, file);
      const stat = statSync(srcPath);

      if (stat.isDirectory()) {
        copyDirRecursive(srcPath, join(CONFIG_LOCATIONS.project, file));
        console.log(`  ✓ Restored project ${file}/`);
      } else {
        copyFileSync(srcPath, join(CONFIG_LOCATIONS.project, file));
        console.log(`  ✓ Restored project ${file}`);
      }
    }
  }

  console.log(`\n✓ Snapshot restored: ${name}`);
}
