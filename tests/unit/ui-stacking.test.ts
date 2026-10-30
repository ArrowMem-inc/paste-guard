// 2026-09-12: on claude.ai the bar was drawn under the composer's
// own layer (screenshot: the bar sat inside the editor's box over its
// placeholder text) so neither button took a click, and clicking outside
// did not dismiss it. These tests cover the stacking fix and the
// outside-click dismissal that jsdom can exercise directly; only manual
// testing in a real browser can prove the three real sites turning ON and
// the buttons taking a click on claude.ai itself.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { userActivations } from "../support/trusted";
import { createBar, insertBar, removeBar } from "../../src/ui";

beforeEach(() => userActivations());
afterEach(() => vi.restoreAllMocks());

function setUpComposer(): HTMLElement {
  document.body.innerHTML = '<div id="host"><textarea id="composer"></textarea></div>';
  return document.getElementById("composer") as HTMLElement;
}

describe("createBar stacking", () => {
  it("sets a relative position and a maximum z-index inline", () => {
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    const style = bar.getAttribute("style") ?? "";
    expect(style).toMatch(/position\s*:\s*relative/i);
    expect(style).toMatch(/z-index\s*:\s*2147483647/);
  });

  // 2026-09-13: stacking context alone did not stop the overlap -- a
  // transparent background let a host placeholder painted behind the bar
  // show through it (screenshot evidence on all six sites). An opaque
  // background is what actually occludes whatever is behind the bar; this
  // guards against a future edit quietly putting `background:transparent`
  // back.
  it("has an opaque background so no host text can show through it", () => {
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    const style = bar.getAttribute("style") ?? "";
    expect(style).not.toMatch(/background\s*:\s*transparent/i);
    expect(style).toMatch(/background\s*:\s*Canvas\s*;/i);
  });
});

describe("outside-click dismissal", () => {
  it("a pointerdown outside the bar removes it and calls onRemove", () => {
    const composer = setUpComposer();
    const onRemove = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove, onProceed: () => {} });
    insertBar(composer, bar);

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(document.body.contains(bar)).toBe(false);
  });

  it("a pointerdown inside the bar does not remove it", () => {
    const composer = setUpComposer();
    const onRemove = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove, onProceed: () => {} });
    insertBar(composer, bar);

    bar.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(document.body.contains(bar)).toBe(true);
  });

  it("a pointerdown on a button does not trigger the outside-click removal path twice", () => {
    const composer = setUpComposer();
    const onRemove = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove, onProceed: () => {} });
    insertBar(composer, bar);
    const removeBtn = bar.querySelectorAll("button")[0] as HTMLButtonElement;

    removeBtn.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("preventDefault is called on a button's pointerdown so a host cannot steal focus first", () => {
    const composer = setUpComposer();
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed: () => {} });
    insertBar(composer, bar);
    const removeBtn = bar.querySelectorAll("button")[0] as HTMLButtonElement;

    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    removeBtn.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("removeBar detaches the outside-click listener so a later pointerdown is a no-op", () => {
    const composer = setUpComposer();
    const onRemove = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove, onProceed: () => {} });
    insertBar(composer, bar);
    removeBar(bar);

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("clicking a button still calls its callback (click path unaffected by pointerdown handling)", () => {
    const composer = setUpComposer();
    const onProceed = vi.fn();
    const bar = createBar("card", "send", "en", { onRemove: () => {}, onProceed });
    insertBar(composer, bar);
    const proceedBtn = bar.querySelectorAll("button")[1] as HTMLButtonElement;

    proceedBtn.click();

    expect(onProceed).toHaveBeenCalledOnce();
  });
});
