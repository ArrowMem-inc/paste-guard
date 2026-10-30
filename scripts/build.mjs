#!/usr/bin/env node
// Bundles the extension into dist/ (Chrome/Edge) or dist-firefox/ (Firefox).
// Plain esbuild, no framework, IIFE output so no import/export
// statements or dynamic import() remain in the built files (the built
// bundle must never call importScripts either).
import { build } from "esbuild";
import { mkdirSync, copyFileSync, existsSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = process.argv.includes("--firefox") ? "dist-firefox" : "dist";
const outdir = path.join(root, target);

if (existsSync(outdir)) rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: {
    content: path.join(root, "src/content.ts"),
    background: path.join(root, "src/background.ts"),
    popup: path.join(root, "src/popup.ts"),
  },
  bundle: true,
  format: "iife",
  target: "es2022",
  outdir,
  platform: "browser",
  legalComments: "none",
  minify: false,
});

const manifestSrc = target === "dist-firefox" ? "manifest.firefox.json" : "manifest.json";
// The two copied text files are normalised to LF so a CRLF checkout cannot
// change the shipped bytes.
function copyTextLf(from, to) {
  writeFileSync(to, readFileSync(from, "utf8").replace(/\r\n?/g, "\n"));
}
copyTextLf(path.join(root, manifestSrc), path.join(outdir, "manifest.json"));
copyTextLf(path.join(root, "src/popup.html"), path.join(outdir, "popup.html"));

const iconsSrc = path.join(root, "icons");
const iconsOut = path.join(outdir, "icons");
mkdirSync(iconsOut, { recursive: true });
for (const file of readdirSync(iconsSrc)) {
  copyFileSync(path.join(iconsSrc, file), path.join(iconsOut, file));
}

console.log(`built ${target}/ from ${manifestSrc}`);
