// Fixes F2, F4, F5, F7, exercised end to end against jsdom
// with a fake chrome global (same harness shape as content.test.ts).
//
// FALSIFIED 2026-10-29 (each break was made, the named test went red, then
// restored; see the commit message for the exact failures):
//   F2 remove activation.trusted guard in ui.ts wireButton
//   F4 make findSendButton return null after the site selectors
//   F5 remove the bar-target early return in onDocumentKeydown
//   F7 remove the isComposing / keyCode 229 return
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const CARD = "4242 4242 4242 4242";
let store: Map<string, unknown>;
let teardown: (() => void) | null = null;

beforeEach(() => {
  vi.resetModules();
  store = new Map();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string | string[] | null) => {
          if (keys === null) return Object.fromEntries(store.entries());
          const out: Record<string, unknown> = {};
          for (const k of Array.isArray(keys) ? keys : [keys]) if (store.has(k)) out[k] = store.get(k);
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        },
        remove: async () => {},
      },
      onChanged: { addListener: () => {} },
    },
    runtime: { sendMessage: () => {}, onMessage: { addListener: () => {} } },
  });
});

afterEach(() => {
  teardown?.();
  teardown = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function load(trusted: boolean) {
  const mod = await import("../../src/content");
  if (trusted) {
    const ui = await import("../../src/ui");
    vi.spyOn(ui.activation, "trusted").mockReturnValue(true);
  }
  return mod;
}
const flush = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};
function setUp(): HTMLTextAreaElement {
  document.body.innerHTML = '<div id="host"><textarea id="prompt-textarea"></textarea></div>';
  return document.getElementById("prompt-textarea") as HTMLTextAreaElement;
}
function enter(init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init });
}
function snoozeKeys(): string[] {
  return [...store.keys()].filter((k) => k.startsWith("snooze:"));
}
function setRect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => "" }) as DOMRect;
}

describe("F2 untrusted clicks on the bar buttons", () => {
  it("an untrusted click on Send anyway writes no snooze key and leaves the bar", async () => {
    const composer = setUp();
    const mod = await load(false);
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    composer.value = CARD;
    composer.dispatchEvent(enter());
    const buttons = document.querySelectorAll("[data-paste-guard-bar] button");
    expect(buttons.length).toBe(2);
    (buttons[1] as HTMLButtonElement).click();
    await flush();
    expect(snoozeKeys()).toEqual([]);
    expect(document.querySelector("[data-paste-guard-bar]")).not.toBeNull();
  });

  it("an untrusted click on Remove it leaves the bar and the text", async () => {
    const composer = setUp();
    const mod = await load(false);
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    composer.value = CARD;
    composer.dispatchEvent(enter());
    (document.querySelectorAll("[data-paste-guard-bar] button")[0] as HTMLButtonElement).click();
    expect(document.querySelector("[data-paste-guard-bar]")).not.toBeNull();
    expect(composer.value).toBe(CARD);
  });

  it("control: a trusted click on Send anyway does write the snooze key", async () => {
    const composer = setUp();
    const mod = await load(true);
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    composer.value = CARD;
    composer.dispatchEvent(enter());
    (document.querySelectorAll("[data-paste-guard-bar] button")[1] as HTMLButtonElement).click();
    await flush();
    expect(snoozeKeys()).toEqual(["snooze:chatgpt"]);
  });
});

describe("F4 send-button fallback", () => {
  function loadFixture() {
    const html = readFileSync("fixtures/send-fallback/composer.html", "utf8");
    document.body.innerHTML = html.slice(html.indexOf("<main>"), html.indexOf("</main>") + 7);
    const composer = document.getElementById("prompt-textarea") as HTMLTextAreaElement;
    const send = document.getElementById("renamed-send") as HTMLElement;
    const feedback = document.getElementById("feedback") as HTMLElement;
    setRect(composer, { left: 100, top: 500, width: 400, height: 60 });
    setRect(send, { left: 510, top: 505, width: 40, height: 40 });
    setRect(feedback, { left: 0, top: 0, width: 80, height: 30 });
    return { composer, send };
  }

  it("findSendButton finds the renamed button, nearest the composer", async () => {
    const { composer, send } = loadFixture();
    const { findSendButton, SITES } = await import("../../src/sites");
    const site = SITES.find((s) => s.id === "chatgpt")!;
    expect(findSendButton(site, document, composer)).toBe(send);
  });

  it("a click on the fallback button with a card in the composer is blocked", async () => {
    const { composer, send } = loadFixture();
    const mod = await load(true);
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    composer.value = CARD;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    send.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(document.querySelector("[data-paste-guard-bar]")).not.toBeNull();
  });
});

describe("F5 keys inside the bar", () => {
  it("Enter keydown whose target is a bar button is not treated as a send", async () => {
    const composer = setUp();
    const mod = await load(true);
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    composer.value = CARD;
    composer.dispatchEvent(enter());
    const bar = document.querySelector("[data-paste-guard-bar]") as HTMLElement;
    const btn = bar.querySelector("button") as HTMLButtonElement;
    const ev = enter();
    btn.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    // still exactly one bar, not a replacement of it
    expect(document.querySelectorAll("[data-paste-guard-bar]").length).toBe(1);
    expect(document.querySelector("[data-paste-guard-bar]")).toBe(bar);
  });
});

describe("F7 IME composition", () => {
  it("Enter with isComposing is not intercepted", async () => {
    const composer = setUp();
    const mod = await load(true);
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    composer.value = CARD;
    const ev = enter({ isComposing: true });
    composer.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(document.querySelector("[data-paste-guard-bar]")).toBeNull();
  });

  it("Enter with keyCode 229 is not intercepted", async () => {
    const composer = setUp();
    const mod = await load(true);
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    composer.value = CARD;
    const ev = enter({ keyCode: 229 });
    composer.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(document.querySelector("[data-paste-guard-bar]")).toBeNull();
  });

  it("control: a plain Enter is still intercepted", async () => {
    const composer = setUp();
    const mod = await load(true);
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    composer.value = CARD;
    const ev = enter();
    composer.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
