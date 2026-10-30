// Three interception points, nothing retained, reads only
// the composer, and site-status messages -- exercised end to end
// against jsdom with a fake chrome global. content.ts's top-level auto-init
// is a no-op under vitest because `chrome` is undefined until this file
// stubs it, so every scenario below wires up explicitly via
// __initForTests(overrides).
//
// FALSIFIED 2026-09-07: broke the paste handler by removing its
// `clipboardEvent.preventDefault()` call -> the "Stripe test card in a
// paste is caught and the field stays empty until Remove" test failed
// because the pasted text landed in the textarea's value before our
// (no longer preventing) handler could intervene. Restored preventDefault.
//
// FALSIFIED 2026-09-07 (second): broke handleSendHit's onRemove callback
// by removing the `clearComposer(composerEl)` call -> the "send is
// caught, storage/console/DOM outside the composer carry zero hits of the
// planted card number" test failed because the composer still held the
// card number as text after Remove. Restored clearComposer.
//
// FALSIFIED 2026-09-07: made init() load
// the snooze as 0 instead of the stored expiry -> "a snooze already in
// storage at load suppresses the bar" failed with "expected true to be
// false" (the paste was intercepted). Restored. This is the defect that
// had shipped: the cache was set to Date.now() + 1, so a snooze lasted
// one millisecond after any reload.
//
// FALSIFIED 2026-09-07: restored the observe-only-when-
// unwired-at-init behaviour (`if (!wiredComposer) observer.observe(...)`)
// -> "re-wires a replacement composer and reports ON for it" failed with
// "expected [] to deeply equal [ true ]" and "reports OFF once and stays OFF
// while the composer is gone" failed with "expected [] to deeply equal
// [ false ]". Restored. A wrong falsification is recorded too: adding
// observer.disconnect() right after the first wire did NOT go red, because
// observer.observe() runs after attempt() and re-arms it; only the
// conditional observe reproduces the defect.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const STRIPE_TEST_CARD = "4242 4242 4242 4242";

function fakeChromeStorage() {
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

let sentMessages: unknown[];
let consoleCalls: unknown[][];
let teardown: (() => void) | null = null;
type RuntimeMessageListener = (
  message: { type: string },
  sender: unknown,
  sendResponse: (response: unknown) => void
) => boolean | void;
let onMessageListeners: RuntimeMessageListener[];

function setUpChatgptComposer(): HTMLTextAreaElement {
  document.body.innerHTML = '<div id="host"><textarea id="prompt-textarea"></textarea></div>';
  return document.getElementById("prompt-textarea") as HTMLTextAreaElement;
}

beforeEach(() => {
  vi.resetModules();
  sentMessages = [];
  consoleCalls = [];
  onMessageListeners = [];
  const fake = fakeChromeStorage();
  vi.stubGlobal("chrome", {
    storage: {
      local: fake.local,
      onChanged: { addListener: () => {} },
    },
    runtime: {
      sendMessage: (msg: unknown) => {
        sentMessages.push(msg);
      },
      onMessage: {
        addListener: (fn: RuntimeMessageListener) => {
          onMessageListeners.push(fn);
        },
      },
    },
  });
  // Capture any console output a broken implementation might produce,
  // without letting it print to the real console during the run.
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    consoleCalls.push(args);
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleCalls.push(args);
  });
});

afterEach(() => {
  // Each init keeps a MutationObserver and a document click listener alive
  // for the page's lifetime; a test's copy must not outlive the test.
  teardown?.();
  teardown = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // One test replaces ./detectors/index with a throwing stub via
  // vi.doMock; unmock it here so it never leaks into a later test.
  vi.doUnmock("../../src/detectors/index");
});

describe("site-status messaging", () => {
  it("reports found:false, siteId:null for a site not on the list", async () => {
    document.body.innerHTML = "<div></div>";
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "example.com", pathname: "/" });
    await flush();
    expect(sentMessages).toEqual([
      { type: "site-status", found: false, siteId: null, displayName: null, captured: null },
    ]);
  });

  it("reports found:false with the site id when the composer is not found", async () => {
    document.body.innerHTML = "<div>no composer here</div>";
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    expect(sentMessages).toEqual([
      {
        type: "site-status",
        found: false,
        siteId: "chatgpt",
        displayName: "ChatGPT",
        captured: "2026-09-07",
      },
    ]);
  });

  it("reports found:true when the composer is present", async () => {
    setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    expect(sentMessages).toEqual([
      {
        type: "site-status",
        found: true,
        siteId: "chatgpt",
        displayName: "ChatGPT",
        captured: "2026-09-07",
      },
    ]);
  });
});

describe("paste interception, nothing retained", () => {
  it("catches a pasted Stripe test card, blocks insertion, and Remove keeps the field empty", async () => {
    const composer = setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const clipboardData = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    composer.dispatchEvent(pasteEvent);

    // Insertion was cancelled; the composer never received the card text.
    expect(composer.value).toBe("");
    expect(pasteEvent.defaultPrevented).toBe(true);

    // The bar is visible with the "Remove it" option.
    const removeBtn = document.querySelector('[data-paste-guard-bar] button') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();
    expect(composer.value).toBe("");

    await assertZeroRetention();
  });

  it("Paste anyway inserts the text and starts the per-site snooze, still zero retention", async () => {
    const composer = setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const clipboardData = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    composer.dispatchEvent(pasteEvent);

    const buttons = document.querySelectorAll('[data-paste-guard-bar] button');
    const proceedBtn = buttons[1] as HTMLButtonElement;
    expect(proceedBtn.textContent).toBe("Paste anyway");
    proceedBtn.click();

    // The text WAS inserted (that is what "Paste anyway" means) -- this is
    // the one place the composer legitimately holds it, same as if the
    // user had typed it. This test is about our storage/console/DOM-outside-
    // the-composer surfaces, not about the composer itself.
    expect(composer.value).toBe(STRIPE_TEST_CARD);

    await assertZeroRetentionOutsideComposer(composer);
  });
});

describe("drop interception, nothing retained", () => {
  it("catches a dropped Stripe test card and blocks insertion", async () => {
    const composer = setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const dataTransfer = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    composer.dispatchEvent(dropEvent);

    expect(composer.value).toBe("");
    expect(dropEvent.defaultPrevented).toBe(true);

    const buttons = document.querySelectorAll('[data-paste-guard-bar] button');
    expect(buttons[1]!.textContent).toBe("Drop anyway");

    await assertZeroRetention();
  });
});

describe("send interception (typed content, not just pasted)", () => {
  it("catches a hand-typed Stripe test card on Enter and Remove clears the field", async () => {
    const composer = setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    // Simulates the user typing the number by hand (send reads the
    // composer's current text, so typed content is caught too).
    composer.value = STRIPE_TEST_CARD;

    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    composer.dispatchEvent(enterEvent);

    expect(enterEvent.defaultPrevented).toBe(true);
    const bar = document.querySelector("[data-paste-guard-bar]");
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain("card number");

    const removeBtn = document.querySelectorAll('[data-paste-guard-bar] button')[0] as HTMLButtonElement;
    removeBtn.click();
    expect(composer.value).toBe("");

    await assertZeroRetention();
  });

  it("does not intercept Shift+Enter (newline, not send)", async () => {
    const composer = setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    composer.value = STRIPE_TEST_CARD;
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    composer.dispatchEvent(enterEvent);

    expect(enterEvent.defaultPrevented).toBe(false);
    expect(document.querySelector("[data-paste-guard-bar]")).toBeNull();
  });

  it("Send anyway starts a snooze so the next send of the same content is not re-caught", async () => {
    const composer = setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    composer.value = STRIPE_TEST_CARD;
    composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    const proceedBtn = document.querySelectorAll('[data-paste-guard-bar] button')[1] as HTMLButtonElement;
    expect(proceedBtn.textContent).toBe("Send anyway");
    proceedBtn.click();
    await flush();

    // Try again with the same content: no bar this time (snoozed).
    composer.value = STRIPE_TEST_CARD;
    const secondEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    composer.dispatchEvent(secondEnter);
    expect(secondEnter.defaultPrevented).toBe(false);
    expect(document.querySelectorAll("[data-paste-guard-bar]").length).toBe(0);

    // The snooze record itself is site id + expiry only.
    const raw = await chrome.storage.local.get(null);
    const entries = Object.entries(raw);
    expect(entries).toHaveLength(1);
    const [key, value] = entries[0]!;
    expect(key).toBe("snooze:chatgpt");
    expect(typeof value).toBe("number");
  });
});

describe("send interception runs before an ancestor's own capture-phase Enter handling (listener depth)", () => {
  it("still sees the real text and still blocks when an ancestor reads/clears the composer first", async () => {
    const composer = setUpChatgptComposer();
    const host = document.getElementById("host") as HTMLElement;

    // Mimics the host page's own Enter-to-send handling: a capture-phase
    // keydown listener on an ANCESTOR of the composer that reads the
    // composer's current text, records it as "sent", and clears the
    // composer -- exactly what claude.ai's own handling was measured doing
    // in a real browser. During capture, listeners on this ancestor node
    // ALWAYS run before a listener attached to the composer itself (the
    // composer is the event target: target-phase listeners run only after
    // every ancestor's capture listener has already run), so this
    // deterministically reproduces the ordering the bug depends on -- it
    // does not merely assert that a handler exists.
    const hostSent: string[] = [];
    host.addEventListener(
      "keydown",
      (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key !== "Enter" || ke.shiftKey) return;
        hostSent.push(composer.value);
        composer.value = "";
      },
      true
    );

    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    composer.value = STRIPE_TEST_CARD;
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    composer.dispatchEvent(enterEvent);

    // Our interception has to see the real text and stop the host's own
    // handler from ever running: nothing was "sent" to the host, and the
    // block bar is showing for the real card number, not an empty string.
    // A listener attached to the composer (the old, broken shape) fires
    // AFTER the ancestor above has already emptied the field: hostSent
    // would hold the real card number, defaultPrevented would be false,
    // and no bar would appear -- this assertion block goes red against
    // that shape and green against a document-level listener.
    expect(hostSent).toEqual([]);
    expect(enterEvent.defaultPrevented).toBe(true);
    const bar = document.querySelector("[data-paste-guard-bar]");
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain("card number");
  });
});

describe("the snooze survives a page reload for its full hour", () => {
  it("a snooze already in storage at load suppresses the bar", async () => {
    const composer = setUpChatgptComposer();
    await chrome.storage.local.set({ "snooze:chatgpt": Date.now() + 30 * 60 * 1000 });
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const clipboardData = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    composer.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(document.querySelector("[data-paste-guard-bar]")).toBeNull();
  });

  it("an expired snooze in storage at load does not suppress the bar", async () => {
    const composer = setUpChatgptComposer();
    await chrome.storage.local.set({ "snooze:chatgpt": Date.now() - 1000 });
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const clipboardData = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    composer.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(document.querySelector("[data-paste-guard-bar]")).not.toBeNull();
  });
});

describe("a composer the site replaces or removes", () => {
  it("re-wires a replacement composer and reports ON for it", async () => {
    setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    sentMessages.length = 0;

    // The single-page app re-renders: a NEW element with the same selector.
    document.body.innerHTML = '<div id="host"><textarea id="prompt-textarea"></textarea></div>';
    await flush();

    // The swap lands in one observer batch: the old element is gone and the
    // new one is found in the same pass, so exactly one ON is reported and
    // no OFF (the badge was never over an unwatched field).
    const founds = (sentMessages as Array<{ found: boolean }>).map((m) => m.found);
    expect(founds).toEqual([true]);

    const replacement = document.getElementById("prompt-textarea") as HTMLTextAreaElement;
    replacement.value = STRIPE_TEST_CARD;
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    replacement.dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(document.querySelector("[data-paste-guard-bar]")).not.toBeNull();
  });

  it("reports OFF once and stays OFF while the composer is gone", async () => {
    const composer = setUpChatgptComposer();
    const { __initForTests } = await loadContent();
    teardown = __initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    sentMessages.length = 0;

    composer.remove();
    await flush();
    document.body.appendChild(document.createElement("p"));
    await flush();

    const founds = (sentMessages as Array<{ found: boolean }>).map((m) => m.found);
    expect(founds).toEqual([false]);
  });
});

// 2026-09-09: the last outcome for the page, in memory only.
// __lastOutcomeForTests is read as `mod.__lastOutcomeForTests` (a property
// read on the module namespace object) rather than destructured once --
// destructuring would copy out the value at that instant and go stale;
// the namespace property itself is a live binding that reflects the
// module's current `lastOutcome`.
describe("live last-outcome for the popup", () => {
  it("starts as none for a freshly wired page", async () => {
    setUpChatgptComposer();
    const mod = await loadContent();
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();
    expect(mod.__lastOutcomeForTests).toEqual({ kind: "none", category: null });
  });

  it("records the category as blocked when a paste is intercepted", async () => {
    const composer = setUpChatgptComposer();
    const mod = await loadContent();
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const clipboardData = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    composer.dispatchEvent(pasteEvent);

    expect(mod.__lastOutcomeForTests).toEqual({ kind: "blocked", category: "card" });
  });

  it("Remove it keeps the outcome as blocked -- the paste really was blocked", async () => {
    const composer = setUpChatgptComposer();
    const mod = await loadContent();
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const clipboardData = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    composer.dispatchEvent(pasteEvent);

    const removeBtn = document.querySelector("[data-paste-guard-bar] button") as HTMLButtonElement;
    removeBtn.click();
    expect(mod.__lastOutcomeForTests).toEqual({ kind: "blocked", category: "card" });
  });

  it("Paste anyway resets the outcome to none -- the text was sent after all", async () => {
    const composer = setUpChatgptComposer();
    const mod = await loadContent();
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const clipboardData = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    composer.dispatchEvent(pasteEvent);

    const buttons = document.querySelectorAll("[data-paste-guard-bar] button");
    (buttons[1] as HTMLButtonElement).click();
    expect(mod.__lastOutcomeForTests).toEqual({ kind: "none", category: null });
  });

  it("Send anyway (typed content) resets the outcome to none the same way", async () => {
    const composer = setUpChatgptComposer();
    const mod = await loadContent();
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    composer.value = STRIPE_TEST_CARD;
    composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(mod.__lastOutcomeForTests).toEqual({ kind: "blocked", category: "card" });

    const proceedBtn = document.querySelectorAll("[data-paste-guard-bar] button")[1] as HTMLButtonElement;
    proceedBtn.click();
    expect(mod.__lastOutcomeForTests).toEqual({ kind: "none", category: null });
  });

  it("FALSIFIED 2026-09-09: a detector throwing surfaces as the error outcome, and the event is NOT intercepted", async () => {
    const composer = setUpChatgptComposer();
    vi.doMock("../../src/detectors/index", () => ({
      detectCategories: () => {
        throw new Error("planted detector failure");
      },
    }));
    const mod = await loadContent();
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    composer.value = STRIPE_TEST_CARD;
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    composer.dispatchEvent(enterEvent);

    // No category to show a bar for, so the event is not blocked -- but the
    // failure is recorded so the popup can surface it.
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(document.querySelector("[data-paste-guard-bar]")).toBeNull();
    expect(mod.__lastOutcomeForTests).toEqual({ kind: "error", category: null });
  });

  it("answers get-last-outcome with the current in-memory outcome, synchronously, nothing else", async () => {
    setUpChatgptComposer();
    const mod = await loadContent();
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    expect(onMessageListeners.length).toBeGreaterThan(0);
    let response: unknown = "not-called";
    const handled = onMessageListeners[0]!({ type: "get-last-outcome" }, {}, (r) => {
      response = r;
    });
    expect(response).toEqual({ kind: "none", category: null });
    // Synchronous answer: no `return true` (that would tell chrome.runtime
    // to keep the message channel open for an async sendResponse, which
    // this listener never needs).
    expect(handled).toBeUndefined();
  });

  it("get-last-outcome never appears in chrome.storage or console output", async () => {
    const composer = setUpChatgptComposer();
    const mod = await loadContent();
    teardown = mod.__initForTests({ hostname: "chatgpt.com", pathname: "/" });
    await flush();

    const clipboardData = { getData: (fmt: string) => (fmt === "text/plain" ? STRIPE_TEST_CARD : "") };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    composer.dispatchEvent(pasteEvent);

    let response: unknown;
    onMessageListeners[0]!({ type: "get-last-outcome" }, {}, (r) => {
      response = r;
    });
    expect(response).toEqual({ kind: "blocked", category: "card" });

    await assertZeroRetention();
  });
});

// content.ts auto-inits at import time whenever `chrome` and `document`
// already exist (its real-browser entry point). Under vitest that fires
// once per fresh module instance using the untouched jsdom `location`
// (localhost, matches no site) purely as a side effect of the import --
// discard whatever it sent so each test only sees messages from its own
// explicit __initForTests(overrides) call.
async function loadContent(opts: { userClicks?: boolean } = {}) {
  const mod = await import("../../src/content");
  // modules are reset per test, so the stub must target the fresh ui module
  if (opts.userClicks !== false) {
    const ui = await import("../../src/ui");
    vi.spyOn(ui.activation, "trusted").mockReturnValue(true);
  }
  sentMessages.length = 0;
  return mod;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function assertZeroRetention(): Promise<void> {
  const raw = await chrome.storage.local.get(null);
  for (const value of Object.values(raw)) {
    expect(String(value)).not.toContain("4242");
  }
  for (const call of consoleCalls) {
    expect(JSON.stringify(call)).not.toContain("4242");
  }
  expect(document.body.innerHTML).not.toContain("4242");
}

async function assertZeroRetentionOutsideComposer(composer: HTMLTextAreaElement): Promise<void> {
  const raw = await chrome.storage.local.get(null);
  for (const value of Object.values(raw)) {
    expect(String(value)).not.toContain("4242");
  }
  for (const call of consoleCalls) {
    expect(JSON.stringify(call)).not.toContain("4242");
  }
  const clone = document.body.cloneNode(true) as HTMLElement;
  const composerClone = clone.querySelector("#prompt-textarea");
  composerClone?.remove();
  expect(clone.innerHTML).not.toContain("4242");
}
