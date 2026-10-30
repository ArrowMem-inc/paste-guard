// The inline bar. Directly above the composer, role=alert, one
// sentence naming the category, two buttons, Escape = Remove, keyboard
// reachable. Never a modal, never a page overlay.
import type { Category } from "./detectors/types";
import { pickString, type StringKey } from "./strings";

export type BarMode = "send" | "paste" | "drop";

export interface BarCallbacks {
  onRemove: () => void;
  onProceed: () => void;
}

const CATEGORY_KEYS: Record<Category, StringKey> = {
  card: "categoryCard",
  sin: "categorySin",
  ssn: "categorySsn",
  passport: "categoryPassport",
  secret: "categorySecret",
  health: "categoryHealth",
};

const PROCEED_KEYS: Record<BarMode, StringKey> = {
  send: "sendAnyway",
  paste: "pasteAnyway",
  drop: "dropAnyway",
};

// F2: a page script can call button.click() or dispatch a
// synthetic click on either bar button, which would remove the bar and, on
// "Send anyway", start the one-hour snooze. Only a user activation
// (event.isTrusted) may act. Kept behind this one object so unit tests, where
// jsdom marks every event untrusted and the property is unforgeable, can
// stub the answer; production always reads event.isTrusted.
export const activation = {
  trusted(event: Event): boolean {
    return event.isTrusted === true;
  },
};

export const BAR_ATTR = "data-paste-guard-bar";

const BUTTON_STYLE =
  "font:inherit;padding:4px 10px;border:1px solid currentColor;border-radius:4px;" +
  "background:transparent;color:inherit;cursor:pointer;";

export function createBar(
  category: Category,
  mode: BarMode,
  language: string,
  callbacks: BarCallbacks
): HTMLElement {
  const bar = document.createElement("div");
  bar.setAttribute("role", "alert");
  bar.setAttribute(BAR_ATTR, "true");
  bar.tabIndex = -1;
  // Inline, neutral, theme-agnostic: inherits the site's text colour, draws
  // its own border. Inline so site CSS resets cannot hide it. The final look
  // is a design row, not this file's decision.
  // 2026-09-12: claude.ai drew the bar UNDER the composer's own
  // layer (screenshot evidence: the bar sat inside the editor's box, over
  // its placeholder text), so neither button took a click. position:relative
  // plus a maximum z-index puts the bar in its own stacking context above
  // any host layer without changing the look (never fixed/absolute -- this
  // stays an inline element, never a page overlay).
  // 2026-09-13: stacking alone did not fix the overlap -- background was
  // transparent, so a host placeholder painted at the same position (all
  // six sites use absolute/negative-margin composer chrome, not plain
  // block flow) showed straight through the bar's own text. `Canvas`/
  // `CanvasText` are CSS system colors: opaque, and they already match
  // each browser's/OS's light-or-dark form-field color, so the bar occludes
  // whatever is behind it on every site without hardcoding a theme.
  bar.setAttribute(
    "style",
    "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 6px;padding:8px 12px;" +
      "border:1px solid currentColor;border-radius:6px;font:14px/1.4 system-ui,sans-serif;" +
      "color:CanvasText;background:Canvas;position:relative;z-index:2147483647;"
  );

  const message = document.createElement("span");
  message.textContent = pickString(CATEGORY_KEYS[category], language);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = pickString("removeIt", language);
  removeBtn.setAttribute("aria-label", pickString("removeIt", language));
  removeBtn.setAttribute("style", BUTTON_STYLE);
  wireButton(removeBtn, () => callbacks.onRemove());

  const proceedBtn = document.createElement("button");
  proceedBtn.type = "button";
  const proceedLabel = pickString(PROCEED_KEYS[mode], language);
  proceedBtn.textContent = proceedLabel;
  proceedBtn.setAttribute("aria-label", proceedLabel);
  proceedBtn.setAttribute("style", BUTTON_STYLE);
  wireButton(proceedBtn, () => callbacks.onProceed());

  bar.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      callbacks.onRemove();
    }
  });

  bar.append(message, removeBtn, proceedBtn);
  outsideClickCallbacks.set(bar, callbacks);
  return bar;
}

// 2026-09-12: on some hosts (claude.ai) the underlying editor's own
// mousedown handler steals focus/selection before our click listener ever
// runs, which reads on the page as "the button does not take a click".
// Handling pointerdown/mousedown with preventDefault stops the host from
// intercepting the interaction; the callback itself still fires on click
// (the same event a keyboard activation dispatches), same as before.
function wireButton(button: HTMLButtonElement, trigger: () => void): void {
  const swallow = (event: Event): void => {
    event.preventDefault();
  };
  button.addEventListener("pointerdown", swallow);
  button.addEventListener("mousedown", swallow);
  button.addEventListener("click", (event: Event) => {
    if (!activation.trusted(event)) return;
    trigger();
  });
}

// Bar -> its callbacks, so the outside-click listener installed by
// insertBar can call onRemove without changing insertBar's signature.
const outsideClickCallbacks = new WeakMap<HTMLElement, BarCallbacks>();
// Bar -> its outside-pointerdown listener, so removeBar can detach it.
const outsideClickListeners = new WeakMap<HTMLElement, (event: Event) => void>();

// Inserts the bar directly above the composer element ("an inline
// element inserted directly above the composer"), then moves keyboard
// focus onto it so Escape and Tab work immediately.
export function insertBar(composer: Element, bar: HTMLElement): void {
  const parent = composer.parentElement;
  if (!parent) return;
  parent.insertBefore(bar, composer);
  const firstButton = bar.querySelector("button");
  (firstButton as HTMLElement | null)?.focus();

  // 2026-09-12: clicking outside the bar did not dismiss it on
  // claude.ai. A capture-phase document listener, installed only while
  // this bar is in the document, removes it on a pointerdown outside.
  const onOutsidePointerDown = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && bar.contains(target)) return;
    const callbacks = outsideClickCallbacks.get(bar);
    removeBar(bar);
    callbacks?.onRemove();
  };
  outsideClickListeners.set(bar, onOutsidePointerDown);
  document.addEventListener("pointerdown", onOutsidePointerDown, true);
}

export function removeBar(bar: HTMLElement): void {
  const listener = outsideClickListeners.get(bar);
  if (listener) {
    document.removeEventListener("pointerdown", listener, true);
    outsideClickListeners.delete(bar);
  }
  outsideClickCallbacks.delete(bar);
  bar.remove();
}

export function findExistingBar(root: ParentNode): HTMLElement | null {
  return root.querySelector(`[${BAR_ATTR}="true"]`);
}
