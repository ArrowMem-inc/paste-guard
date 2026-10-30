// The build normalises the two copied text files to LF, and no text file in
// either dist carries a CR byte.
//
// FALSIFIED 2026-10-29: replaced copyTextLf with a plain copy in
// scripts/build.mjs -> this test failed on dist/popup.html (CR bytes from the
// CRLF src/popup.html); restored.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("dist text files", () => {
  for (const flag of [[], ["--firefox"]]) {
    const dir = flag.length ? "dist-firefox" : "dist";
    it(`${dir} has no CR byte in any .js, .json or .html file`, () => {
      execFileSync("node", ["scripts/build.mjs", ...flag], { stdio: "pipe" });
      const files = walk(dir).filter((f) => /\.(js|json|html)$/.test(f));
      expect(files.length).toBeGreaterThan(3);
      for (const f of files) {
        expect(readFileSync(f).includes(13), f).toBe(false);
      }
    });
  }
});
