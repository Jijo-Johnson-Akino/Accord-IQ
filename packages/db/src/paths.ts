import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function findWorkspaceRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function dbPackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}
