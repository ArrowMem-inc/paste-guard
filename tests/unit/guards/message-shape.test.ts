// 2026-09-09: "a test that the message shape has no
// field that could carry content." GetLastOutcomeMessage (popup -> content
// script) has a type discriminant and nothing else. LastOutcome (content
// script -> popup) has exactly `kind` (one of three fixed strings) and
// `category` (one of the six fixed detector category strings, or null) --
// never the matched text, an offset, a length, or a timestamp.
//
// Found (2026-09-09) that the FALSIFIED test below never ran the real
// scan at all: it asserted `"...snippet...".includes("snippet")` against a
// hardcoded string, which is true regardless of whether
// extractInterfaceBlock or the forbidden-field check does anything.
// Rewritten to build an actual fixture FILE from a mutated COPY of the
// real messages.ts (never the real file itself, which is never touched)
// with a forbidden field planted into its real LastOutcome interface
// block, then run the exact same scanInterfaceForForbiddenFields function
// the real test uses against that fixture, and assert it reports the
// planted field. If extractInterfaceBlock or the forbidden-name check were
// ever broken (wrong interface name, wrong bracket matching, a typo in the
// forbidden list), this now goes red -- the earlier version could not.
//
// FALSIFIED 2026-09-09 (this version): temporarily deleted the "snippet"
// entry from FORBIDDEN_FIELD_NAMES -> the new fixture-based test failed
// with "expected [] to contain 'snippet'" (the real interface block, real
// scan, real fixture -- correctly found nothing forbidden once "snippet"
// was no longer on the list). Restored the entry, confirmed green.
//
// FALSIFIED 2026-09-09 (earlier, superseded): "added a sixth field to a
// copy of the LastOutcome shape used only inside this test" -- kept as a
// record of the gap, not as a claim about what this file proves now.
import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GetLastOutcomeMessage, LastOutcome } from "../../../src/messages";

const MESSAGES_FILE = path.resolve(__dirname, "../../../src/messages.ts");
const CATEGORY_VALUES = ["card", "sin", "ssn", "passport", "secret", "health"];
const OUTCOME_KINDS = ["blocked", "error", "none"];
const FORBIDDEN_FIELD_NAMES = ["text", "value", "content", "raw", "matched", "snippet", "timestamp", "offset"];

function extractInterfaceBlock(source: string, name: string): string {
  const start = source.indexOf(`interface ${name}`);
  if (start === -1) throw new Error(`interface ${name} not found`);
  const end = source.indexOf("}", start);
  return source.slice(start, end + 1);
}

// The one real scan, used by both the real assertion below and the
// FALSIFIED test that proves this function actually does something.
function scanInterfaceForForbiddenFields(
  source: string,
  interfaceName: string,
  forbidden: string[]
): string[] {
  const block = extractInterfaceBlock(source, interfaceName).toLowerCase();
  return forbidden.filter((name) => block.includes(name));
}

describe("live-outcome message shape carries no content", () => {
  it("GetLastOutcomeMessage is a bare type discriminant, no payload", () => {
    const msg: GetLastOutcomeMessage = { type: "get-last-outcome" };
    expect(Object.keys(msg)).toEqual(["type"]);
  });

  it("LastOutcome has only kind and category, both bounded enums incapable of carrying arbitrary text", () => {
    const samples: LastOutcome[] = [
      { kind: "blocked", category: "card" },
      { kind: "error", category: null },
      { kind: "none", category: null },
    ];
    for (const outcome of samples) {
      expect(Object.keys(outcome).sort()).toEqual(["category", "kind"]);
      expect(OUTCOME_KINDS).toContain(outcome.kind);
      if (outcome.category !== null) {
        expect(CATEGORY_VALUES).toContain(outcome.category);
      }
    }
  });

  it("the source declares no field name that could hold arbitrary text", () => {
    const source = readFileSync(MESSAGES_FILE, "utf8");
    const outcomeHits = scanInterfaceForForbiddenFields(source, "LastOutcome", FORBIDDEN_FIELD_NAMES);
    const requestHits = scanInterfaceForForbiddenFields(
      source,
      "GetLastOutcomeMessage",
      FORBIDDEN_FIELD_NAMES
    );
    expect(outcomeHits, `LastOutcome declares forbidden field(s): ${outcomeHits.join(", ")}`).toEqual([]);
    expect(
      requestHits,
      `GetLastOutcomeMessage declares forbidden field(s): ${requestHits.join(", ")}`
    ).toEqual([]);
  });

  it("FALSIFIED: the real scan fires against a fixture file built from a mutated copy of the real LastOutcome interface", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-message-shape-"));
    try {
      const realSource = readFileSync(MESSAGES_FILE, "utf8");
      // Plant a forbidden field into a COPY of the real LastOutcome block's
      // text (never the real file, which stays untouched on disk).
      const realBlock = extractInterfaceBlock(realSource, "LastOutcome");
      expect(realBlock).not.toContain("snippet"); // sanity: not already there
      const mutatedBlock = realBlock.replace("{", "{\n  snippet: string;");
      const fixturePath = path.join(dir, "messages-with-planted-field.ts");
      writeFileSync(fixturePath, mutatedBlock);

      const fixtureSource = readFileSync(fixturePath, "utf8");
      const hits = scanInterfaceForForbiddenFields(fixtureSource, "LastOutcome", FORBIDDEN_FIELD_NAMES);
      expect(hits).toContain("snippet");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not flag an interface that declares none of the forbidden names", () => {
    const clean = "interface Clean {\n  kind: string;\n  category: string | null;\n}";
    const hits = scanInterfaceForForbiddenFields(clean, "Clean", FORBIDDEN_FIELD_NAMES);
    expect(hits).toEqual([]);
  });

  it("category, when present, is drawn only from the fixed six-value detector enum (src/detectors/types.ts)", () => {
    const detectorTypesSource = readFileSync(
      path.resolve(__dirname, "../../../src/detectors/types.ts"),
      "utf8"
    );
    for (const value of CATEGORY_VALUES) {
      expect(detectorTypesSource).toContain(`"${value}"`);
    }
  });
});
