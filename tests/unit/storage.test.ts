// Snooze storage holds only a site id + expiry timestamp, never
// content. Health-detector option defaults to OFF.
//
// FALSIFIED 2026-09-07: broke isSnoozed by removing the `expiry > now`
// comparison (made it return true whenever any expiry value existed,
// including an already-expired one) -> test "an expired snooze is not
// active" failed with "expected true to be false". Restored the
// comparison.
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  isSnoozed,
  startSnooze,
  isHealthDetectorEnabled,
  setHealthDetectorEnabled,
  getThemePreference,
  setThemePreference,
  getLangPreference,
  setLangPreference,
} from "../../src/storage";

function fakeChromeStorage() {
  const store = new Map<string, unknown>();
  return {
    store,
    local: {
      get: async (keys: string | string[] | null) => {
        if (keys === null) {
          return Object.fromEntries(store.entries());
        }
        const list = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of list) {
          if (store.has(k)) out[k] = store.get(k);
        }
        return out;
      },
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      },
      remove: async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) store.delete(k);
      },
    },
  };
}

beforeEach(() => {
  const fake = fakeChromeStorage();
  vi.stubGlobal("chrome", { storage: { local: fake.local } });
});

describe("snooze storage", () => {
  it("is not snoozed before any snooze is started", async () => {
    expect(await isSnoozed("chatgpt")).toBe(false);
  });

  it("is snoozed immediately after starting", async () => {
    await startSnooze("chatgpt", 1000);
    expect(await isSnoozed("chatgpt", 1000)).toBe(true);
  });

  it("an expired snooze is not active", async () => {
    await startSnooze("chatgpt", 1000);
    const oneHourAndOneMs = 1000 + 60 * 60 * 1000 + 1;
    expect(await isSnoozed("chatgpt", oneHourAndOneMs)).toBe(false);
  });

  it("a snooze is per-site", async () => {
    await startSnooze("chatgpt", 1000);
    expect(await isSnoozed("claude", 1000)).toBe(false);
  });

  it("stores only the site id and an expiry timestamp, never content", async () => {
    await startSnooze("chatgpt", 1000);
    const raw = await chrome.storage.local.get(null);
    const values = Object.entries(raw);
    expect(values).toHaveLength(1);
    const [key, value] = values[0]!;
    expect(key).toBe("snooze:chatgpt");
    expect(typeof value).toBe("number");
  });
});

describe("health detector option (off by default)", () => {
  it("defaults to disabled", async () => {
    expect(await isHealthDetectorEnabled()).toBe(false);
  });

  it("can be enabled explicitly", async () => {
    await setHealthDetectorEnabled(true);
    expect(await isHealthDetectorEnabled()).toBe(true);
  });

  it("can be disabled again", async () => {
    await setHealthDetectorEnabled(true);
    await setHealthDetectorEnabled(false);
    expect(await isHealthDetectorEnabled()).toBe(false);
  });
});

// 2026-09-09: the corner control's two preference values. Nothing
// about content, nothing about a scan or a block, ever lands here.
describe("corner control preferences", () => {
  it("theme defaults to system before any explicit choice", async () => {
    expect(await getThemePreference()).toBe("system");
  });

  it("theme can be set to light or dark explicitly", async () => {
    await setThemePreference("dark");
    expect(await getThemePreference()).toBe("dark");
    await setThemePreference("light");
    expect(await getThemePreference()).toBe("light");
  });

  it("a stored theme value outside light/dark reads back as system, never thrown", async () => {
    await chrome.storage.local.set({ "option:theme": "not-a-real-value" });
    expect(await getThemePreference()).toBe("system");
  });

  it("lang defaults to null (no explicit choice) before any is made", async () => {
    expect(await getLangPreference()).toBeNull();
  });

  it("lang can be set to en or fr explicitly", async () => {
    await setLangPreference("fr");
    expect(await getLangPreference()).toBe("fr");
    await setLangPreference("en");
    expect(await getLangPreference()).toBe("en");
  });

  it("a stored lang value outside en/fr reads back as null, never a third value", async () => {
    await chrome.storage.local.set({ "option:lang": "de" });
    expect(await getLangPreference()).toBeNull();
  });

  it("FALSIFIED-style: setting theme/lang writes only their own key, nothing else", async () => {
    await setThemePreference("dark");
    await setLangPreference("fr");
    const raw = await chrome.storage.local.get(null);
    expect(Object.keys(raw).sort()).toEqual(["option:lang", "option:theme"]);
  });
});
