// "Under 50 ms to decide on a 20,000-character message, measured in a
// test." Measures detectCategories() -- the full decision, all five
// non-health detectors plus health when enabled -- on a 20,000 character
// message.
import { describe, expect, it } from "vitest";
import { detectCategories } from "../../src/detectors/index";

function buildMessage(len: number): string {
  const filler =
    "the quick brown fox jumps over the lazy dog and keeps going for a while more, ";
  let out = "";
  while (out.length < len) out += filler;
  return out.slice(0, len) + " card 4242 4242 4242 4242 and my diagnosis is here";
}

describe("detection performance", () => {
  it("decides in under 50ms on a 20,000 character message, health off", () => {
    const text = buildMessage(20000);
    const start = performance.now();
    detectCategories(text);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("decides in under 50ms on a 20,000 character message, health on", () => {
    const text = buildMessage(20000);
    const start = performance.now();
    detectCategories(text, { includeHealth: true });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
