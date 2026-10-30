// Canadian SIN detector: 9 digits, Luhn-valid, any whitespace
// (including a non-breaking space or a newline) or dash variant allowed
// (the usual 3-3-3 grouping). Returns true/false only.
//
// FALSIFIED 2026-09-20: a non-breaking-space-separated
// SIN missed the old `[ -]?` separator class. See card.ts for the same fix.
import { luhnValid } from "./luhn";
import type { Detector } from "./types";

// F8: zero-width characters (U+200B-U+200D, U+2060, U+FEFF) are not \s in JS.
const SEP = "[\\s\\u200B-\\u200D\\u2060\\uFEFF\\u2010-\\u2015\\u2212-]";
const CANDIDATE = new RegExp(`\\b\\d{3}${SEP}?\\d{3}${SEP}?\\d{3}\\b`, "g");

export function detectSin(text: string): boolean {
  const matches = text.match(CANDIDATE);
  if (!matches) return false;
  for (const raw of matches) {
    const digits = raw.replace(new RegExp(SEP, "g"), "");
    if (digits.length === 9 && luhnValid(digits)) {
      return true;
    }
  }
  return false;
}

export const sinDetector: Detector = { category: "sin", test: detectSin };
