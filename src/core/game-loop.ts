export interface LoopCallbacks {
  update: (fixedDeltaSec: number) => void;
  render: (alpha: number, frameDeltaSec: number) => void;
}

export class GameLoop {
  private readonly fixedStepSec: number;
  private readonly callbacks: LoopCallbacks;
  private rafId = 0;
  private lastTimeMs = 0;
  private accumulatorSec = 0;
  private running = false;

  constructor(callbacks: LoopCallbacks, fixedStepSec = 1 / 60) {
    this.callbacks = callbacks;
    this.fixedStepSec = fixedStepSec;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTimeMs = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame = (nowMs: number): void => {
    if (!this.running) {
      return;
    }

    const rawDeltaSec = (nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;
    const frameDeltaSec = Math.min(0.25, rawDeltaSec);

    this.accumulatorSec += frameDeltaSec;
    while (this.accumulatorSec >= this.fixedStepSec) {
      this.callbacks.update(this.fixedStepSec);
      this.accumulatorSec -= this.fixedStepSec;
    }

    const alpha = this.accumulatorSec / this.fixedStepSec;
    this.callbacks.render(alpha, frameDeltaSec);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
