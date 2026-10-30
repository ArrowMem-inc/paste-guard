// Category identifies WHICH kind of sensitive content a detector found.
// Detectors never return the matched text itself, only this category string:
// the matched text and its offsets never leave the detector module.
export type Category = "card" | "sin" | "ssn" | "passport" | "secret" | "health";

export interface Detector {
  category: Category;
  // Pure function: same input always produces the same output, no I/O,
  // no storage, no console, no network. Returns true/false only.
  test(text: string): boolean;
}
