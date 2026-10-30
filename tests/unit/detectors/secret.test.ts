// FALSIFIED 2026-09-07: broke detectSecret by removing the AWS pattern
// from the PATTERNS array -> test "detects an AWS access key id" failed
// with "expected false to be true". Restored the pattern.
//
// FALSIFIED 2026-09-07: put the original narrow sk pattern back
// (no hyphen or underscore allowed after the prefix)
// -> "detects a project-scoped sk- key" and "detects an sk-ant- shaped key"
// both failed with "expected false to be true". Restored the wider class.
//
// Every key shaped value below is built at run time from short parts, so no
// key shaped literal exists in this file.
import { describe, expect, it } from "vitest";
import { detectSecret } from "../../../src/detectors/secret";
import { join, rep } from "../../support/fixtures";

describe("detectSecret", () => {
  it("detects an sk-prefixed secret key", () => {
    expect(detectSecret(join("key: ", "sk", "-", rep("ab", 5), rep("1", 10)))).toBe(true);
  });

  it("detects a project-scoped sk- key with hyphens and underscores after the prefix", () => {
    const key = join("OPENAI_KEY=", "sk", "-", "proj", "-", rep("Ab12", 2), "_", rep("cd34", 2), "-", rep("EF56", 2));
    expect(detectSecret(key)).toBe(true);
  });

  it("detects an sk-ant- shaped key", () => {
    expect(detectSecret(join("sk", "-", "ant", "-", "api03", "-", rep("abcd", 7)))).toBe(true);
  });

  it("detects an AWS access key id", () => {
    expect(detectSecret(join("AK", "IA", rep("AB", 8)))).toBe(true);
  });

  it("detects a GitHub personal access token", () => {
    expect(detectSecret(join("gh", "p_", rep("ab", 18), rep("0", 6)))).toBe(true);
  });

  it("detects a Slack token", () => {
    expect(detectSecret(join("xo", "xb", "-", rep("12", 5), "-", rep("ab", 6)))).toBe(true);
  });

  it("detects a PEM private key header", () => {
    expect(detectSecret(join(rep("-", 5), "BEGIN RSA PRIVATE KEY", rep("-", 5), "\n", "MI", "IB..."))).toBe(true);
  });

  it("detects an AIza-prefixed API key", () => {
    expect(detectSecret(join("AI", "za", "Sy", rep("AB", 15)))).toBe(true);
  });

  it("ignores ordinary prose", () => {
    expect(detectSecret("here is my grocery list for tonight")).toBe(false);
  });

  it("detects a Stripe live secret key", () => {
    expect(detectSecret(join("STRIPE_KEY=", "sk", "_", "live", "_", rep("ab", 12)))).toBe(true);
  });

  it("detects a Stripe test secret key", () => {
    expect(detectSecret(join("sk", "_", "test", "_", rep("ab", 12)))).toBe(true);
  });

  it("detects a GitHub fine-grained PAT", () => {
    expect(detectSecret(join("github", "_", "pat", "_", rep("11AB", 3), rep("cd", 12)))).toBe(true);
  });

  it("detects a raw JWT", () => {
    const jwt = join("ey", "J", rep("a", 16), ".", "ey", "J", rep("b", 20), ".", rep("c", 43));
    expect(detectSecret(jwt)).toBe(true);
  });
});
