// Store submission (2026-09-12): the manifest declared icons and an
// action.default_icon at four sizes (16, 32, 48, 128) but nothing proved
// the built dist/ and dist-firefox/ actually carried a PNG at every
// declared path, at the declared pixel size. A missing or mis-sized icon
// file is invisible until the Chrome Web Store dashboard rejects the
// package -- this test reads each PNG's own IHDR header (bytes 16-23) so a
// wrong-sized render fails here, not on the form.
//
// FALSIFIED 2026-09-12: renamed icons/icon-48.png away before running this
// test (the test rebuilds dist/ and dist-firefox/ itself, so the source
// icons/ tree, not the build output, is what must be broken) -> failed
// with "missing icon file: dist-firefox/icons/icon-48.png" (both dist/
// and dist-firefox/ cases failed). Restored, re-verified green.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));

const ICON_SIZES: Record<string, number> = {
  "icons/icon-16.png": 16,
  "icons/icon-32.png": 32,
  "icons/icon-48.png": 48,
  "icons/icon-128.png": 128,
};

function pngDimensions(filePath: string): { width: number; height: number } {
  const buf = readFileSync(filePath);
  // PNG signature is 8 bytes, then the IHDR chunk: 4-byte length, 4-byte
  // "IHDR", then width (4 bytes) and height (4 bytes), big-endian.
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function build(target: "dist" | "dist-firefox") {
  const args = target === "dist-firefox" ? ["scripts/build.mjs", "--firefox"] : ["scripts/build.mjs"];
  execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });
}

describe("manifest icon declarations exist in the built output at the declared size", () => {
  it("manifest.json and manifest.firefox.json declare exactly the same icon set", () => {
    const chrome = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
    const firefox = JSON.parse(readFileSync(path.join(root, "manifest.firefox.json"), "utf8"));
    expect(chrome.icons).toEqual(ICON_SIZES_AS_MANIFEST());
    expect(firefox.icons).toEqual(ICON_SIZES_AS_MANIFEST());
    expect(chrome.action.default_icon).toEqual(ICON_SIZES_AS_MANIFEST());
    expect(firefox.action.default_icon).toEqual(ICON_SIZES_AS_MANIFEST());
  });

  function ICON_SIZES_AS_MANIFEST(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const relPath of Object.keys(ICON_SIZES)) {
      const size = relPath.match(/icon-(\d+)\.png$/)![1];
      out[size] = relPath;
    }
    return out;
  }

  for (const target of ["dist", "dist-firefox"] as const) {
    it(`${target}/ carries every declared icon at its declared pixel size`, () => {
      build(target);
      for (const [relPath, size] of Object.entries(ICON_SIZES)) {
        const filePath = path.join(root, target, relPath);
        expect(existsSync(filePath), `missing icon file: ${target}/${relPath}`).toBe(true);
        const { width, height } = pngDimensions(filePath);
        expect(width, `${relPath} declared ${size}x${size}, file is ${width}x${height}`).toBe(size);
        expect(height, `${relPath} declared ${size}x${size}, file is ${width}x${height}`).toBe(size);
      }
    });
  }
});
