// Health detector. Label-based ONLY, a short published word list;
// never a symptom guess. OFF BY DEFAULT in v1 (see src/storage.ts and
// README): its false-positive rate on ordinary chat has not yet been
// measured. Callers must opt in explicitly; detectCategories() below
// excludes it unless includeHealth is passed.
import type { Detector } from "./types";

export const HEALTH_WORDS: readonly string[] = [
  "diagnosis",
  "prescription",
  "prescribed",
  "test result",
  "positive for",
  "HIV",
  "cancer",
  "therapy notes",
];

// Whole-word (or whole-phrase) match: a substring check would make
// "archive" an HIV hit and "cancerous" is fine either way. Case-insensitive.
const HEALTH_PATTERNS: RegExp[] = HEALTH_WORDS.map(
  (word) => new RegExp("(?<![a-z])" + word.replace(/ /g, "\\s+") + "(?![a-z])", "i")
);

export function detectHealth(text: string): boolean {
  return HEALTH_PATTERNS.some((p) => p.test(text));
}

export const healthDetector: Detector = { category: "health", test: detectHealth };
