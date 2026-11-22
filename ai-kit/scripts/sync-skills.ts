import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const sourceSkillsDir = path.join(rootDir, ".gemini", "skills");

const targetDirs = [
  path.join(rootDir, ".claude", "skills"),
  path.join(rootDir, ".codex", "skills"),
  path.join(rootDir, ".agent", "skills"),
];

export async function syncSkills(): Promise<void> {
  const stat = await fs.stat(sourceSkillsDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    process.stderr.write(`Source skills directory not found: ${sourceSkillsDir}\n`);
    return;
  }

  for (const targetDir of targetDirs) {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.cp(sourceSkillsDir, targetDir, { recursive: true, force: true });
    process.stdout.write(`Synced skills to: ${targetDir}\n`);
  }
}

// Self-execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncSkills().catch((err) => {
    process.stderr.write(`Sync error: ${err}\n`);
    process.exit(1);
  });
}
