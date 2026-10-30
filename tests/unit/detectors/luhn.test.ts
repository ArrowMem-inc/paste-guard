// FALSIFIED 2026-09-07: broke luhnValid by removing the `d -= 9` correction
// on doubled digits. The Stripe/test-card numbers below never exercise
// that line (every doubled digit in 4242.../4111... stays <= 9, so the
// correction is a no-op for them and those two tests stayed green even
// broken -- a real gap, caught by trying the break before trusting the
// test). "100000058" does exercise it (its doubled '5' becomes 10, which
// needs the -9 correction to become 1): with the correction removed,
// "validates a carry-digit case (exercises the d -= 9 correction)" failed
// with "expected false to be true". Restored the correction.
import { describe, expect, it } from "vitest";
import { luhnValid } from "../../../src/detectors/luhn";

describe("luhnValid", () => {
  it("validates a known Stripe test card", () => {
    expect(luhnValid("4242424242424242")).toBe(true);
  });

  it("validates a second known test card", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
  });

  it("validates a carry-digit case (exercises the d -= 9 correction)", () => {
    expect(luhnValid("100000058")).toBe(true);
  });

  it("rejects a non-Luhn 16 digit run", () => {
    expect(luhnValid("4242424242424241")).toBe(false);
  });

  it("rejects non-digit input", () => {
    expect(luhnValid("42-42")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(luhnValid("")).toBe(false);
  });
});
