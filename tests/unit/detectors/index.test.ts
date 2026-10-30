// FALSIFIED 2026-09-07: broke detectCategories by removing the
// `opts.includeHealth &&` guard so health always ran -> test "excludes
// health unless includeHealth is passed" failed with "expected [ 'health'
// ] to deeply equal []" (health fired even though the caller never opted
// in). Restored the guard. This is the control behind the health detector
// being off by default (README).
import { describe, expect, it } from "vitest";
import { detectCategories, firstCategory } from "../../../src/detectors/index";
import { join, rep } from "../../support/fixtures";

describe("detectCategories", () => {
  it("excludes health unless includeHealth is passed", () => {
    expect(detectCategories("my diagnosis is here")).toEqual([]);
  });

  it("includes health when includeHealth is passed", () => {
    expect(detectCategories("my diagnosis is here", { includeHealth: true })).toEqual([
      "health",
    ]);
  });

  it("reports every category that hits", () => {
    const text = join("card 4242 4242 4242 4242 and key ", "sk", "-", rep("ab", 5), rep("1", 10));
    const hits = detectCategories(text);
    expect(hits).toContain("card");
    expect(hits).toContain("secret");
  });

  it("returns empty for clean prose", () => {
    expect(detectCategories("what is the weather like today")).toEqual([]);
  });
});

describe("firstCategory", () => {
  it("returns null when nothing hits", () => {
    expect(firstCategory("nothing sensitive here")).toBeNull();
  });

  it("returns a category when something hits", () => {
    expect(firstCategory("4242 4242 4242 4242")).toBe("card");
  });
});
