// No product identity in this repo's own copy beyond the site list.
// Slug built from fragments so this file's own source never contains the
// forbidden strings. Also forbids the word "veteran" anywhere (this
// extension is broad-audience, not veteran-only).
//
// FALSIFIED 2026-09-07: planted "our vacform helper" in a temp dir and
// called scanForProductIdentity() -> it threw listing that file. Also
// planted "for veterans" in a second temp dir -> it threw for the
// "veteran" word. Both confirmed the check fires; temp dirs removed after.
import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { walkFiles } from "../../support/walk-files";

const ROOT = path.resolve(__dirname, "../../..");
const SELF = path.resolve(__filename);

const _A = "va" + "c";
const _B = "cp" + "p";
const SLUG_PATTERN = new RegExp(`(?<![a-z])(${_A}|${_B})(?![a-z])|(my)?(${_A}|${_B})form`, "i");
const VETERAN_PATTERN = /veteran/i;

export function scanForProductIdentity(dir: string): string[] {
  const violations: string[] = [];
  for (const file of walkFiles(dir)) {
    if (path.resolve(file) === SELF) continue;
    const text = readFileSync(file, "utf8");
    if (SLUG_PATTERN.test(text)) violations.push(`${path.relative(dir, file)}: product slug`);
    if (VETERAN_PATTERN.test(text)) violations.push(`${path.relative(dir, file)}: "veteran"`);
  }
  if (violations.length > 0) {
    throw new Error(`product identity found:\n${violations.join("\n")}`);
  }
  return violations;
}

describe("no product identity", () => {
  it("finds none in the repo", () => {
    expect(() => scanForProductIdentity(ROOT)).not.toThrow();
  });

  it("does not flag an unrelated word containing the slug as a substring", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-slug-safe-"));
    try {
      writeFileSync(path.join(dir, "safe.txt"), "please evacuate the vacuum cleaner room");
      expect(() => scanForProductIdentity(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FALSIFIED: throws when the product slug is planted", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-slug-"));
    try {
      writeFileSync(path.join(dir, "leak.txt"), "our vacform helper is separate");
      expect(() => scanForProductIdentity(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FALSIFIED: throws when the word veteran is planted", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-veteran-"));
    try {
      writeFileSync(path.join(dir, "leak.txt"), "built for veterans first");
      expect(() => scanForProductIdentity(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
