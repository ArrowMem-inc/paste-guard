// 2026-09-09: "a test that walks every write to
// chrome.storage in src/ and asserts the key set is exactly the documented
// one." Three parts, closing a gap found (2026-09-09): a scratch
// export added inside storage.ts under a brand new key passed the old
// version of this file, because it (a) exempted storage.ts's own body from
// any scan at all, and (b) only ever called four hardcoded exports, so an
// unexercised new writer function's key never appeared anywhere to be
// compared against.
//
//   1. storage.ts is the ONLY file in src/ that ever calls a chrome.storage
//      write method (unchanged from before -- scans everything else).
//   2. storage.ts's OWN source is scanned for every key literal or key
//      prefix reachable from a `.set(`/`.remove(` call (resolving through
//      one level of local `const key = ...` aliasing), and that set is
//      compared against the documented allowlist below. This catches a new
//      write even if nothing ever calls the function that makes it.
//   3. storage.ts's exports are enumerated at runtime (Object.keys on the
//      imported module, not a hardcoded list) and every one that is not a
//      declared getter must have an entry in WRITER_INVOCATIONS, which is
//      what actually gets called before the final key-set assertion. A new
//      exported writer with no invocation here fails immediately, before
//      its key could ever go unexercised.
//
// FALSIFIED 2026-09-09 (this file, proving the gap): planted
// `chrome.storage.local.set({ "totally:new:key": 1 });` directly inside
// storage.ts's body (not behind any exported function) -> test 2 failed:
// the raw-call-count cross-check ("every .set(/.remove( call in storage.ts
// was resolved") caught it because the planted call has no computed
// `[key]` bracket for the resolver to parse. Reverted, confirmed green.
// Separately planted a new exported function
// `export async function setSomethingNew(x) { await area().set({ "new:key": x }); }`
// -> test 3's "every exported non-getter has an invocation" assertion
// failed listing `setSomethingNew` (present in the dynamic export list,
// absent from WRITER_INVOCATIONS). Reverted, confirmed green. Neither
// planted file exists in the tree; both were hand-verified in the working
// tree and reverted before this file was committed.
//
// FALSIFIED 2026-09-07 (earlier version of this file, kept for history):
// planted `chrome.storage.local.set({x:1})` in a temp file under a
// throwaway src/ copy and pointed the out-of-file scan at it -> the "sole
// writer" assertion failed listing that file.
import { describe, expect, it, vi } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { walkFiles } from "../../support/walk-files";
import * as storageModule from "../../../src/storage";

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");
const STORAGE_FILE = path.resolve(SRC, "storage.ts");
const WRITE_PATTERN = /\.storage\.(local|sync|session)\.(set|remove)\(/;

// The one place the documented allowlist lives. Everything else in this
// file either derives from it or is checked against it.
const DOCUMENTED_EXACT_KEYS = [
  "option:healthDetectorEnabled",
  "option:lang",
  "option:theme",
].sort();
const DOCUMENTED_PREFIXES = ["snooze:"].sort();
const DOCUMENTED_KEY_SET = [
  "option:healthDetectorEnabled",
  "option:lang",
  "option:theme",
  "snooze:chatgpt",
].sort();

function scanForStorageWritesOutside(dir: string, exempt: string): string[] {
  const offenders: string[] = [];
  for (const file of walkFiles(dir)) {
    if (path.resolve(file) === exempt) continue;
    const text = readFileSync(file, "utf8");
    if (WRITE_PATTERN.test(text)) offenders.push(path.relative(ROOT, file));
  }
  return offenders;
}

// ---- Part 2: resolve every set/remove call in storage.ts's own source to
// a key literal or a key prefix, through at most one level of local
// `const <name> = <expr>;` aliasing (the only pattern this file uses:
// `const key = SNOOZE_PREFIX + siteId;` a couple of lines above the call).
interface KeyScanResult {
  exact: string[];
  prefixes: string[];
  unresolved: string[];
  totalWriteCalls: number;
  resolvedWriteCalls: number;
}

function scanStorageSourceForKeys(source: string): KeyScanResult {
  // Module-level SCREAMING_CASE string constants: the only things this
  // scanner treats as a "known key literal".
  const topConstants = new Map<string, string>();
  const topConstPattern = /^const\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*;/gm;
  let m: RegExpExecArray | null;
  while ((m = topConstPattern.exec(source))) {
    topConstants.set(m[1]!, m[2]!);
  }

  // Every `const <name> = <expr>;` anywhere in the file (function-scoped
  // included), keyed by name -> list of raw RHS expressions assigned to
  // that name (a name can be reused, harmlessly, across functions).
  const localAssignments = new Map<string, string[]>();
  const anyConstPattern = /const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;]+);/g;
  while ((m = anyConstPattern.exec(source))) {
    const name = m[1]!;
    const rhs = m[2]!.trim();
    const list = localAssignments.get(name) ?? [];
    list.push(rhs);
    localAssignments.set(name, list);
  }

  const exact = new Set<string>();
  const prefixes = new Set<string>();
  const unresolved = new Set<string>();

  function resolve(expr: string, seen: Set<string>): void {
    const trimmed = expr.trim();
    if (topConstants.has(trimmed)) {
      exact.add(topConstants.get(trimmed)!);
      return;
    }
    const plusMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\+/);
    if (plusMatch && topConstants.has(plusMatch[1]!)) {
      prefixes.add(topConstants.get(plusMatch[1]!)!);
      return;
    }
    const isBareIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed);
    if (isBareIdentifier && localAssignments.has(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      for (const rhs of localAssignments.get(trimmed)!) resolve(rhs, seen);
      return;
    }
    unresolved.add(trimmed);
  }

  // Every `.set({ [EXPR]: ... })` call.
  let resolvedCount = 0;
  const setBracketPattern = /\.set\(\s*\{\s*\[([^\]]+)\]/g;
  while ((m = setBracketPattern.exec(source))) {
    resolve(m[1]!, new Set());
    resolvedCount++;
  }
  // Every `.remove(EXPR)` call (none exist today; resolved the same way if
  // one is ever added).
  const removePattern = /\.remove\(\s*([^)]+?)\s*\)/g;
  while ((m = removePattern.exec(source))) {
    resolve(m[1]!, new Set());
    resolvedCount++;
  }

  const totalWriteCalls = (source.match(/\.(?:set|remove)\(/g) ?? []).length;

  return {
    exact: [...exact].sort(),
    prefixes: [...prefixes].sort(),
    unresolved: [...unresolved].sort(),
    totalWriteCalls,
    resolvedWriteCalls: resolvedCount,
  };
}

// ---- Part 3: every exported function that isn't a declared getter must
// be invoked below. Getters are named here explicitly (not inferred from
// a naming convention) so a misnamed future getter still has to be listed
// by a human, not silently waved through.
const KNOWN_GETTERS = new Set([
  "isSnoozed",
  "getSnoozeUntil",
  "isHealthDetectorEnabled",
  "getThemePreference",
  "getLangPreference",
]);

const WRITER_INVOCATIONS: Record<string, () => Promise<void>> = {
  startSnooze: () => storageModule.startSnooze("chatgpt", 1000),
  setHealthDetectorEnabled: () => storageModule.setHealthDetectorEnabled(true),
  setThemePreference: () => storageModule.setThemePreference("dark"),
  setLangPreference: () => storageModule.setLangPreference("fr"),
};

function exportedFunctionNames(): string[] {
  const mod = storageModule as unknown as Record<string, unknown>;
  return Object.keys(mod)
    .filter((k) => typeof mod[k] === "function")
    .sort();
}

function fakeArea() {
  const store = new Map<string, unknown>();
  return {
    store,
    local: {
      get: async (keys: string | string[] | null) => {
        if (keys === null) return Object.fromEntries(store.entries());
        const list = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of list) if (store.has(k)) out[k] = store.get(k);
        return out;
      },
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      },
      remove: async (keys: string | string[]) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
      },
    },
  };
}

describe("chrome.storage.local: sole writer and exact key set", () => {
  it("storage.ts is the only file in src/ that writes to chrome.storage", () => {
    const offenders = scanForStorageWritesOutside(SRC, STORAGE_FILE);
    expect(offenders, `storage writes outside storage.ts: ${offenders.join(", ")}`).toEqual([]);
  });

  it("FALSIFIED: the out-of-file scan fires on the write shape it looks for", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-storage-write-"));
    try {
      writeFileSync(path.join(dir, "leak.ts"), "chrome.storage.local.set({ oops: 1 });");
      const offenders = scanForStorageWritesOutside(dir, path.join(dir, "nowhere.ts"));
      expect(offenders).toHaveLength(1);
      expect(offenders[0]).toContain("leak.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not flag a read (get) or a listener (onChanged) as a write", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-storage-read-"));
    try {
      writeFileSync(
        path.join(dir, "reader.ts"),
        "chrome.storage.local.get('k'); chrome.storage.onChanged.addListener(() => {});"
      );
      const offenders = scanForStorageWritesOutside(dir, path.join(dir, "nowhere.ts"));
      expect(offenders).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("storage.ts's own set/remove calls resolve to exactly the documented key literals and prefixes", () => {
    const source = readFileSync(STORAGE_FILE, "utf8");
    const result = scanStorageSourceForKeys(source);
    expect(result.unresolved, `unresolved key expression(s): ${result.unresolved.join(", ")}`).toEqual([]);
    expect(result.resolvedWriteCalls, "every .set(/.remove( call in storage.ts must be resolved").toBe(
      result.totalWriteCalls
    );
    expect(result.exact).toEqual(DOCUMENTED_EXACT_KEYS);
    expect(result.prefixes).toEqual(DOCUMENTED_PREFIXES);
  });

  it("FALSIFIED: a bare write with no resolvable key bracket fails the call-count cross-check", () => {
    const source = readFileSync(STORAGE_FILE, "utf8") + '\nchrome.storage.local.set({ "totally:new:key": 1 });\n';
    const result = scanStorageSourceForKeys(source);
    expect(result.resolvedWriteCalls).not.toBe(result.totalWriteCalls);
  });

  it("FALSIFIED: a new top-level key constant used in a resolvable call is caught by the exact/prefix assertion", () => {
    const source =
      readFileSync(STORAGE_FILE, "utf8") +
      '\nconst SNEAKY_KEY = "option:sneaky";\nasync function sneak() { await area().set({ [SNEAKY_KEY]: true }); }\n';
    const result = scanStorageSourceForKeys(source);
    expect(result.exact).not.toEqual(DOCUMENTED_EXACT_KEYS);
    expect(result.exact).toContain("option:sneaky");
  });

  it("every exported function that is not a documented getter has a test invocation below", () => {
    const writers = exportedFunctionNames().filter((name) => !KNOWN_GETTERS.has(name));
    expect(writers).toEqual(Object.keys(WRITER_INVOCATIONS).sort());
  });

  it("FALSIFIED: an export missing from KNOWN_GETTERS and WRITER_INVOCATIONS is not silently accepted", () => {
    const pretendExports = [...exportedFunctionNames(), "setSomethingNew"];
    const writers = pretendExports.filter((name) => !KNOWN_GETTERS.has(name));
    expect(writers).not.toEqual(Object.keys(WRITER_INVOCATIONS).sort());
  });

  it("invoking every dynamically-discovered writer produces exactly the documented key set and nothing else", async () => {
    const fake = fakeArea();
    vi.stubGlobal("chrome", { storage: { local: fake.local } });
    try {
      for (const invoke of Object.values(WRITER_INVOCATIONS)) {
        await invoke();
      }
      const keys = Array.from(fake.store.keys()).sort();
      expect(keys).toEqual(DOCUMENTED_KEY_SET);
      // None of the values are content: a site id, three flag/enum strings,
      // and a numeric expiry.
      expect(typeof fake.store.get("snooze:chatgpt")).toBe("number");
      expect(fake.store.get("option:healthDetectorEnabled")).toBe(true);
      expect(fake.store.get("option:theme")).toBe("dark");
      expect(fake.store.get("option:lang")).toBe("fr");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
