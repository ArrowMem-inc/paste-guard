// The bar is inline (above the composer), role=alert, names the
// category in one sentence, has two named buttons, Escape triggers Remove,
// and is keyboard reachable (focus lands on the first button).
//
// FALSIFIED 2026-09-07: broke createBar by removing the `bar.setAttribute
// ("role", "alert")` line -> test "is announced as an alert" failed with
// "expected null to be 'alert'". Restored the attribute.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { userActivations } from "../support/trusted";
import { createBar, insertBar, removeBar, findExistingBar } from "../../src/ui";
import { STRINGS } from "../../src/strings";

function setUpComposer(): { composer: HTMLElement } {
  document.body.innerHTML = '<div id="host"><textarea id="composer"></textarea></div>';
  const composer = document.getElementById("composer") as HTMLElement;
  return { composer };
}

beforeEach(() => userActivations());
afterEach(() => vi.restoreAllMocks());

describe("createBar", () => {
  it("is announced as an alert", () => {
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    expect(bar.getAttribute("role")).toBe("alert");
  });

  it("names the category in one sentence", () => {
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    expect(bar.textContent).toContain(STRINGS.categoryCard!.en);
  });

  it("has two buttons: Remove it and Send anyway for send mode", () => {
    const bar = createBar("sin", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    const buttons = Array.from(bar.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual([STRINGS.removeIt!.en, STRINGS.sendAnyway!.en]);
  });

  it("labels the proceed button Paste anyway in paste mode", () => {
    const bar = createBar("card", "paste", "en", { onRemove: () => {}, onProceed: () => {} });
    const buttons = Array.from(bar.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual([STRINGS.removeIt!.en, STRINGS.pasteAnyway!.en]);
  });

  it("labels the proceed button Drop anyway in drop mode", () => {
    const bar = createBar("card", "drop", "en", { onRemove: () => {}, onProceed: () => {} });
    const buttons = Array.from(bar.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual([STRINGS.removeIt!.en, STRINGS.dropAnyway!.en]);
  });

  it("Escape triggers onRemove", () => {
    const onRemove = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove, onProceed: () => {} });
    bar.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("clicking Remove calls onRemove", () => {
    const onRemove = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove, onProceed: () => {} });
    const removeBtn = bar.querySelectorAll("button")[0] as HTMLButtonElement;
    removeBtn.click();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("clicking the proceed button calls onProceed", () => {
    const onProceed = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed });
    const proceedBtn = bar.querySelectorAll("button")[1] as HTMLButtonElement;
    proceedBtn.click();
    expect(onProceed).toHaveBeenCalledOnce();
  });
});

describe("insertBar / removeBar (inline, never a modal)", () => {
  it("inserts the bar directly above the composer, as a sibling", () => {
    const { composer } = setUpComposer();
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    insertBar(composer, bar);
    expect(composer.previousElementSibling).toBe(bar);
    expect(bar.parentElement).toBe(composer.parentElement);
  });

  it("moves focus onto the bar's first button for keyboard reachability", () => {
    const { composer } = setUpComposer();
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    insertBar(composer, bar);
    expect(document.activeElement).toBe(bar.querySelector("button"));
  });

  it("removeBar takes the bar out of the DOM", () => {
    const { composer } = setUpComposer();
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    insertBar(composer, bar);
    removeBar(bar);
    expect(findExistingBar(document)).toBeNull();
  });

  it("never inserts anything as a page overlay (no fixed/absolute positioned wrapper)", () => {
    const { composer } = setUpComposer();
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    insertBar(composer, bar);
    const style = bar.getAttribute("style") ?? "";
    expect(style).not.toMatch(/position\s*:\s*(fixed|absolute)/i);
  });
});

// F2: a synthetic click on either bar button is ignored.
// FALSIFIED 2026-10-29: removed the activation.trusted() guard in wireButton
// -> both tests below failed (callback called once); restored.
describe("untrusted activation", () => {
  it("an untrusted click on Remove it does not call onRemove or remove the bar", () => {
    vi.restoreAllMocks();
    const { composer } = setUpComposer();
    const onRemove = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove, onProceed: () => {} });
    insertBar(composer, bar);
    (bar.querySelectorAll("button")[0] as HTMLButtonElement).click();
    expect(onRemove).not.toHaveBeenCalled();
    expect(findExistingBar(document)).not.toBeNull();
  });

  it("an untrusted click on the proceed button does not call onProceed", () => {
    vi.restoreAllMocks();
    const onProceed = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed });
    (bar.querySelectorAll("button")[1] as HTMLButtonElement).click();
    expect(onProceed).not.toHaveBeenCalled();
  });
});
