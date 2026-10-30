// Vendor names may appear ONLY in src/sites.ts and the README's
// <!-- site-list --> ... <!-- /site-list --> section.
//
// FALSIFIED 2026-09-07: planted "built using OpenAI technology" in a temp
// dir's README.md OUTSIDE any site-list markers -> scanForVendorNames()
// threw listing that file. Also planted the same line inside a
// <!-- site-list -->...<!-- /site-list --> block in a second temp dir and
// confirmed it did NOT throw (the exemption works), then moved it outside
// the markers in the same file and confirmed it DID throw. Temp dirs
// removed after.
import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { walkFiles } from "../../support/walk-files";

const ROOT = path.resolve(__dirname, "../../..");
const SELF = path.resolve(__filename);

const VENDOR_NAMES = ["OpenAI", "Anthropic", "Google", "xAI", "Microsoft", "Meta"];
const VENDOR_PATTERN = new RegExp(`\\b(${VENDOR_NAMES.join("|")})\\b`);

function stripSiteListSection(text: string): string {
  return text.replace(/<!--\s*site-list\s*-->[\s\S]*?<!--\s*\/site-list\s*-->/g, "");
}

export function scanForVendorNames(dir: string): string[] {
  const violations: string[] = [];
  const exemptFile = path.resolve(dir, "src/sites.ts");
  for (const file of walkFiles(dir)) {
    const resolved = path.resolve(file);
    if (resolved === SELF) continue;
    if (resolved === exemptFile) continue;
    let text = readFileSync(file, "utf8");
    if (path.basename(file).toLowerCase() === "readme.md") {
      text = stripSiteListSection(text);
    }
    if (VENDOR_PATTERN.test(text)) {
      violations.push(`${path.relative(dir, file)}: vendor name outside allowed sections`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`vendor names found:\n${violations.join("\n")}`);
  }
  return violations;
}

describe("vendor names restricted", () => {
  it("finds none outside src/sites.ts and README's site-list section", () => {
    expect(() => scanForVendorNames(ROOT)).not.toThrow();
  });

  it("FALSIFIED: throws when a vendor name is planted in README outside the markers", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-vendor-"));
    try {
      writeFileSync(path.join(dir, "README.md"), "# Title\n\nbuilt using OpenAI technology\n");
      expect(() => scanForVendorNames(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not throw when the same vendor name is inside the site-list markers", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-vendor-ok-"));
    try {
      const readme = [
        "# Title",
        "<!-- site-list -->",
        "- chatgpt.com (OpenAI)",
        "<!-- /site-list -->",
        "",
      ].join("\n");
      writeFileSync(path.join(dir, "README.md"), readme);
      expect(() => scanForVendorNames(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FALSIFIED: throws once the same line moves outside the markers", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-vendor-moved-"));
    try {
      const readme = [
        "# Title",
        "- chatgpt.com (OpenAI)",
        "<!-- site-list -->",
        "no vendor names here",
        "<!-- /site-list -->",
        "",
      ].join("\n");
      writeFileSync(path.join(dir, "README.md"), readme);
      expect(() => scanForVendorNames(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not flag vendor names inside the exempt src/sites.ts file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-vendor-sites-"));
    try {
      const srcDir = path.join(dir, "src");
      mkdirSync(srcDir);
      writeFileSync(path.join(srcDir, "sites.ts"), 'export const vendor = "OpenAI";\n');
      expect(() => scanForVendorNames(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
