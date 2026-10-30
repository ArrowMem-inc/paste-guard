// No personal names anywhere in the repo. Patterns only, spelled out
// nowhere in this file (this file is exempt from its own scan).
//
// FALSIFIED 2026-09-07: planted a hit in a temp dir (a file containing the
// name shape the first pattern matches, followed by an email whose local
// part matches EMAIL_SHAPE, on another line) and called
// scanForPersonalNames() on that temp dir -> it threw with a message
// listing both the name-shape file and the email-shape file. Confirms the
// check fires; temp dir removed after.
import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { walkFiles } from "../../support/walk-files";

const ROOT = path.resolve(__dirname, "../../..");
const SELF = path.resolve(__filename);

// Patterns describe a SHAPE only (first letter plus length), the same
// disclosure level as NAME_SHAPE below. Never spell the name or the
// email out here.
const NAME_SHAPE = /\bK\w{5}\s+P\w{8}\b/;
const EMAIL_SHAPE = /j\w{7}@/i;

export function scanForPersonalNames(dir: string): string[] {
  const violations: string[] = [];
  for (const file of walkFiles(dir)) {
    if (path.resolve(file) === SELF) continue;
    const text = readFileSync(file, "utf8");
    if (NAME_SHAPE.test(text)) violations.push(`${path.relative(dir, file)}: name-shape pattern`);
    if (EMAIL_SHAPE.test(text)) violations.push(`${path.relative(dir, file)}: email pattern`);
  }
  if (violations.length > 0) {
    throw new Error(`personal names found:\n${violations.join("\n")}`);
  }
  return violations;
}

describe("no personal names", () => {
  it("finds none in the repo", () => {
    expect(() => scanForPersonalNames(ROOT)).not.toThrow();
  });

  it("FALSIFIED: throws when a name-shape hit is planted", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-names-"));
    try {
      // "Kaybee Parsonage" is a synthetic 6-letter/9-letter name shape
      // chosen only to match NAME_SHAPE; it is not anyone's real name.
      writeFileSync(path.join(dir, "leak.txt"), "contact Kaybee Parsonage for details");
      expect(() => scanForPersonalNames(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FALSIFIED: throws when an email hit is planted", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-email-"));
    try {
      // "junktest" is a synthetic local part chosen only to match
      // EMAIL_SHAPE (same first letter, same length); it is not a real
      // address.
      writeFileSync(path.join(dir, "leak.txt"), "reach out at junktest@example.com");
      expect(() => scanForPersonalNames(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
