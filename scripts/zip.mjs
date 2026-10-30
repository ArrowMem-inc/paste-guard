#!/usr/bin/env node
// Zips dist/ (built by `npm run build`) into release/paste-guard-<ver>.zip
// and writes its SHA-256 to release/SHA256SUMS. Never fabricate a hash in
// the README -- this script is the only place the hash is computed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const distDir = process.argv.includes("--firefox") ? "dist-firefox" : "dist";
const suffix = process.argv.includes("--firefox") ? "-firefox" : "";
const distPath = path.join(root, distDir);

if (!existsSync(distPath)) {
  console.error(`${distDir}/ not found. Run "npm run build" first.`);
  process.exit(1);
}

const releaseDir = path.join(root, "release");
mkdirSync(releaseDir, { recursive: true });

const zipName = `paste-guard-${pkg.version}${suffix}.zip`;
const zipPath = path.join(releaseDir, zipName);
if (existsSync(zipPath)) rmSync(zipPath);

// The `zip` binary is not on the machine this is packaged from, so this shells
// out to a stdlib zip writer instead. scripts/zipdir.py carries the full reason
// and the determinism argument. Nothing else about this file changes: the hash
// below is still computed here and here only.
execFileSync("python3", [path.join(root, "scripts", "zipdir.py"), distPath, zipPath], {
  stdio: "inherit",
});

const hash = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
const sumsPath = path.join(releaseDir, "SHA256SUMS");
const line = `${hash}  ${zipName}\n`;

let existing = "";
if (existsSync(sumsPath)) {
  existing = readFileSync(sumsPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.endsWith(zipName))
    .join("\n");
  if (existing) existing += "\n";
}
writeFileSync(sumsPath, existing + line);

console.log(line.trim());
console.log(`wrote ${path.relative(root, sumsPath)}`);
