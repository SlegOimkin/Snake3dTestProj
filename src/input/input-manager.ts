import type { FrameInput } from "../types";
import { clamp } from "../util/math";

export class InputManager {
  private leftPressed = false;
  private rightPressed = false;
  private assistUpPressed = false;
  private assistDownPressed = false;
  private swipeTurn = 0;
  private pointerActive = false;
  private pointerStartX = 0;
  private sensitivity = 1;
  private readonly target: HTMLElement | Window;

  constructor(target: HTMLElement | Window = window) {
    this.target = target;
    this.bindEvents();
  }

  setSensitivity(value: number): void {
    this.sensitivity = clamp(value, 0.55, 1.65);
  }

  getInput(): FrameInput {
    const keyboardTurn = (this.rightPressed ? 1 : 0) - (this.leftPressed ? 1 : 0);
    const merged = clamp((keyboardTurn + this.swipeTurn) * this.sensitivity, -1, 1);
    const assist = (this.assistUpPressed ? 1 : 0) - (this.assistDownPressed ? 1 : 0);
    return {
      turn: merged,
      assist
    };
  }

  applySwipeDelta(deltaX: number, viewportWidth = window.innerWidth || 1280): void {
    const normalized = deltaX / (viewportWidth * 0.23);
    this.swipeTurn = clamp(normalized, -1, 1);
  }

  clearSwipe(): void {
    this.swipeTurn = 0;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
  }

  private bindEvents(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    window.addEventListener("pointercancel", this.onPointerCancel, { passive: true });

    if (this.target instanceof HTMLElement) {
      this.target.style.touchAction = "none";
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") {
      this.leftPressed = true;
    }
    if (event.key === "d" || event.key === "D" || event.key === "ArrowRight") {
      this.rightPressed = true;
    }
    if (event.key === "w" || event.key === "W" || event.key === "ArrowUp") {
      this.assistUpPressed = true;
    }
    if (event.key === "s" || event.key === "S" || event.key === "ArrowDown") {
      this.assistDownPressed = true;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") {
      this.leftPressed = false;
    }
    if (event.key === "d" || event.key === "D" || event.key === "ArrowRight") {
      this.rightPressed = false;
    }
    if (event.key === "w" || event.key === "W" || event.key === "ArrowUp") {
      this.assistUpPressed = false;
    }
    if (event.key === "s" || event.key === "S" || event.key === "ArrowDown") {
      this.assistDownPressed = false;
    }
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerActive = true;
    this.pointerStartX = event.clientX;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerActive) {
      return;
    }
    const delta = event.clientX - this.pointerStartX;
    this.applySwipeDelta(delta, window.innerWidth || 1280);
  };

  private onPointerUp = (): void => {
    this.pointerActive = false;
    this.clearSwipe();
  };

  private onPointerCancel = (): void => {
    this.pointerActive = false;
    this.clearSwipe();
  };
}
