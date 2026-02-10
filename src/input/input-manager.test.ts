import { describe, expect, it } from "vitest";
import { InputManager } from "./input-manager";

describe("input-manager", () => {
  it("maps keyboard left/right to turn signal", () => {
    const manager = new InputManager(window);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(manager.getInput().turn).toBeGreaterThan(0);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
    expect(manager.getInput().turn).toBe(0);
    manager.dispose();
  });

  it("applies swipe delta as turn", () => {
    const manager = new InputManager(window);
    manager.applySwipeDelta(120, 400);
    expect(manager.getInput().turn).toBeGreaterThan(0);
    manager.clearSwipe();
    expect(manager.getInput().turn).toBe(0);
    manager.dispose();
  });
});
