// Shared file-walking helper for the repo-wide guard tests. Not part of the
// shipped extension -- test support only.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-firefox",
  "release",
  "coverage",
  "playwright-report",
  "test-results",
]);

export function walkFiles(dir: string, excludeDirs: Set<string> = DEFAULT_EXCLUDE_DIRS): string[] {
  const out: string[] = [];
  function inner(d: string): void {
    for (const entry of readdirSync(d)) {
      if (excludeDirs.has(entry)) continue;
      const full = path.join(d, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        inner(full);
      } else {
        out.push(full);
      }
    }
  }
  inner(dir);
  return out;
}
