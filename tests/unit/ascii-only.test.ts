// ASCII only in every TEXT file in this repo (house rule: never
// print non-ASCII, and every French string here is a marked placeholder,
// never invented). Walks the working tree (nothing is committed yet, so
// "tracked" reads as "everything in the repo that will be committed"),
// excluding build output, dependencies, and binary assets (the store icon
// PNGs, added 2026-09-12) -- a PNG's own bytes are not text and were never
// what this rule was written to police; the rule's target is copy that
// might get authored or pasted here, not the compressed pixel data of an
// unaltered image render.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-firefox",
  "release",
  "coverage",
  "playwright-report",
  "test-results",
]);
const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".ico"]);
// FALSIFIED 2026-09-12: removed the BINARY_EXTENSIONS skip above -> this
// test failed on all four store icon PNGs (icons/icon-16.png etc, byte 0
// each). Restored, re-verified green.

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
}

describe("ASCII only (house rule)", () => {
  it("has no byte above 0x7F in any repo file", () => {
    const files: string[] = [];
    walk(ROOT, files);
    const offenders: string[] = [];
    for (const file of files) {
      if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
      const buf = readFileSync(file);
      for (let i = 0; i < buf.length; i++) {
        if (buf[i]! > 0x7f) {
          offenders.push(`${path.relative(ROOT, file)}:byte ${i}`);
          break;
        }
      }
    }
    expect(offenders, `non-ASCII bytes found: ${offenders.join(", ")}`).toEqual([]);
  });
});
