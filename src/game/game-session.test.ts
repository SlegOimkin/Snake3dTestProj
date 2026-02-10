import { describe, expect, it } from "vitest";
import { GameSession } from "./game-session";

describe("game-session integration", () => {
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
});
