// Card detector: 13-19 digits, any whitespace (including a
// non-breaking space or a newline) or dash variant (including en/em dash)
// allowed as separators, Luhn-valid. Returns true/false only; never the
// matched digits.
//
// FALSIFIED 2026-09-20: a card grouped with U+00A0
// non-breaking spaces (common when copying from a PDF/Word table), a
// newline-broken card, and an en-dash-separated card all missed the old
// `[ -]?` (plain space/hyphen only) separator class.
import { luhnValid } from "./luhn";
import type { Detector } from "./types";

// F8: zero-width characters (U+200B-U+200D, U+2060, U+FEFF) are not \s in JS.
const SEP = "[\\s\\u200B-\\u200D\\u2060\\uFEFF\\u2010-\\u2015\\u2212-]";
const CANDIDATE = new RegExp(`\\b(?:\\d${SEP}?){12,18}\\d\\b`, "g");

export function detectCard(text: string): boolean {
  const matches = text.match(CANDIDATE);
  if (!matches) return false;
  for (const raw of matches) {
    const digits = raw.replace(new RegExp(SEP, "g"), "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      return true;
    }
  }
  return false;
}

export const cardDetector: Detector = { category: "card", test: detectCard };
