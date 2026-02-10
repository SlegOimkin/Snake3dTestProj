import { describe, expect, it } from "vitest";
import { START_GRACE_SEC } from "../config/game-config";
import { GameSession } from "./game-session";

describe("game-session integration", () => {
  it("does not die immediately after spawn", () => {
    const session = new GameSession();
    session.reset();
    let died = false;
    for (let i = 0; i < 60; i += 1) {
      const result = session.update(1 / 60, { turn: 0, assist: 0 });
      if (result.gameOver) {
        died = true;
        break;
      }
    }
    expect(died).toBe(false);
  });

  it("runs long simulation without throwing", () => {
    const session = new GameSession();
    session.reset();
    for (let i = 0; i < 60 * 60 * 5; i += 1) {
      const turn = Math.sin(i * 0.011) * 0.7;
      const result = session.update(1 / 60, { turn, assist: 0 });
      if (result.gameOver) {
        session.reset();
      }
    }
    const snapshot = session.getSnapshot();
    expect(Number.isFinite(snapshot.head.position.x)).toBe(true);
    expect(snapshot.segments.length).toBeGreaterThan(0);
    expect(snapshot.score.score).toBeGreaterThanOrEqual(0);
  });

  it("does not die during start grace across varied spawn seeds", () => {
    const session = new GameSession();
    const cases = [
      { x: 0, z: 0, heading: 0 },
      { x: 39, z: 39, heading: Math.PI * 0.75 },
      { x: -38, z: 40, heading: Math.PI * 1.35 },
      { x: 41, z: -37, heading: Math.PI * 1.9 }
    ];

    for (const seed of cases) {
      session.reset({
        startPosition: { x: seed.x, y: 0.7, z: seed.z },
        headingRad: seed.heading
      });
      let died = false;
      const ticks = Math.ceil((START_GRACE_SEC - 0.05) * 60);
      for (let i = 0; i < ticks; i += 1) {
        const result = session.update(1 / 60, { turn: 0, assist: 0 });
        if (result.gameOver) {
          died = true;
          break;
        }
      }
      expect(died).toBe(false);
    }
  });
});
