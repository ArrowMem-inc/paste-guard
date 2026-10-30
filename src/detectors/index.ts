// Combines every detector. Never exposes matched text, only the category
// list of which detectors hit.
import { cardDetector } from "./card";
import { sinDetector } from "./sin";
import { ssnDetector } from "./ssn";
import { passportDetector } from "./passport";
import { secretDetector } from "./secret";
import { healthDetector } from "./health";
import type { Category, Detector } from "./types";

export type { Category, Detector } from "./types";
export { detectCard, cardDetector } from "./card";
export { detectSin, sinDetector } from "./sin";
export { detectSsn, ssnDetector } from "./ssn";
export { detectPassport, passportDetector } from "./passport";
export { detectSecret, secretDetector } from "./secret";
export { detectHealth, healthDetector, HEALTH_WORDS } from "./health";

// Priority order: secret keys and card numbers are the highest-confidence,
// highest-harm hits, checked first. Order only affects which category is
// reported first when several hit at once; every hit is still detected.
const NON_HEALTH_DETECTORS: Detector[] = [
  secretDetector,
  cardDetector,
  sinDetector,
  ssnDetector,
  passportDetector,
];

export interface DetectOptions {
  // Health is off by default (see src/detectors/health.ts). Set true only
  // when the caller has explicitly enabled it (chrome.storage.local option).
  includeHealth?: boolean;
}

export function detectCategories(rawText: string, opts: DetectOptions = {}): Category[] {
  // F8: NFKC folds fullwidth digits, the fullwidth hyphen and compatibility
  // forms to ASCII before any detector runs. Detection only; the text itself
  // is never altered or kept.
  const text = rawText.normalize("NFKC");
  const hits: Category[] = [];
  for (const d of NON_HEALTH_DETECTORS) {
    if (d.test(text)) hits.push(d.category);
  }
  if (opts.includeHealth && healthDetector.test(text)) {
    hits.push(healthDetector.category);
  }
  return hits;
}

// The single category to show in the bar: the first (highest priority) hit.
export function firstCategory(text: string, opts: DetectOptions = {}): Category | null {
  const hits = detectCategories(text, opts);
  return hits.length > 0 ? hits[0]! : null;
}
