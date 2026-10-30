// jsdom marks every dispatched event untrusted and isTrusted cannot be
// forged on an instance, so tests that stand in for a real user click make the
// activation check answer true. The untrusted-click tests do NOT call this.
import { vi } from "vitest";
import { activation } from "../../src/ui";

export function userActivations(): void {
  vi.spyOn(activation, "trusted").mockReturnValue(true);
}
