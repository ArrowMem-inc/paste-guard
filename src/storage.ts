// chrome.storage.local only. Every write here is metadata: a site id, an
// expiry timestamp, or a boolean option. Never message content.

const SNOOZE_PREFIX = "snooze:";
const HEALTH_OPTION_KEY = "option:healthDetectorEnabled";
const THEME_OPTION_KEY = "option:theme";
const LANG_OPTION_KEY = "option:lang";
const ONE_HOUR_MS = 60 * 60 * 1000;

export interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

function area(): StorageArea {
  return chrome.storage.local as unknown as StorageArea;
}

// Site + expiry timestamp only, never content.
export async function isSnoozed(siteId: string, now: number = Date.now()): Promise<boolean> {
  const key = SNOOZE_PREFIX + siteId;
  const result = await area().get(key);
  const expiry = result[key];
  return typeof expiry === "number" && expiry > now;
}

// The stored expiry (ms since epoch) or 0 when none is stored. content.ts
// caches this at load so a snooze survives a reload for its full hour.
export async function getSnoozeUntil(siteId: string): Promise<number> {
  const key = SNOOZE_PREFIX + siteId;
  const result = await area().get(key);
  const expiry = result[key];
  return typeof expiry === "number" ? expiry : 0;
}

export async function startSnooze(siteId: string, now: number = Date.now()): Promise<void> {
  const key = SNOOZE_PREFIX + siteId;
  await area().set({ [key]: now + ONE_HOUR_MS });
}

// Health detector: OFF by default in v1 -- ship the health list only
// after its false-positive count on ordinary chat is measured at zero
// over a day. See README.
export async function isHealthDetectorEnabled(): Promise<boolean> {
  const result = await area().get(HEALTH_OPTION_KEY);
  return result[HEALTH_OPTION_KEY] === true;
}

export async function setHealthDetectorEnabled(enabled: boolean): Promise<void> {
  await area().set({ [HEALTH_OPTION_KEY]: enabled });
}

// Corner control (2026-09-09): a manual theme choice and a manual
// language override for the popup only. This is the ONLY other thing this
// file is allowed to store -- two preference values, nothing about content,
// nothing about what was scanned or blocked. "system" means no explicit
// choice has been made yet; the popup then follows prefers-color-scheme.
// A stored value outside the allowed set is treated as absent, never thrown.
export type ThemePreference = "light" | "dark" | "system";
export type LangPreference = "en" | "fr";

export async function getThemePreference(): Promise<ThemePreference> {
  const result = await area().get(THEME_OPTION_KEY);
  const value = result[THEME_OPTION_KEY];
  return value === "light" || value === "dark" ? value : "system";
}

export async function setThemePreference(pref: ThemePreference): Promise<void> {
  await area().set({ [THEME_OPTION_KEY]: pref });
}

// Absent means "no explicit choice made" -- the popup falls back to
// navigator.language, exactly as it always has. Never a third stored value.
export async function getLangPreference(): Promise<LangPreference | null> {
  const result = await area().get(LANG_OPTION_KEY);
  const value = result[LANG_OPTION_KEY];
  return value === "en" || value === "fr" ? value : null;
}

export async function setLangPreference(pref: LangPreference): Promise<void> {
  await area().set({ [LANG_OPTION_KEY]: pref });
}
