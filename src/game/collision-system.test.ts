import { describe, expect, it } from "vitest";
import { checkObstacleCollision, checkSelfCollision } from "./collision-system";

describe("collision-system", () => {
  it("detects self collision after head intersects tail", () => {
    const head = {
      position: { x: 0, y: 0, z: 0 },
      headingRad: 0,
      speed: 1,
      angularVelocity: 0
    };
    const segments = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      position: { x: i < 7 ? 10 + i : 0.2, y: 0, z: 0.2 }
    }));
    expect(checkSelfCollision(head, segments, 80, 80, 4, 0.7)).toBe(true);
  });

  it("respects pulse obstacle radius over time", () => {
    const head = {
      position: { x: 0.9, y: 0, z: 0 },
      headingRad: 0,
      speed: 1,
      angularVelocity: 0
    };
    const obstacle = {
      id: 1,
      position: { x: 0, y: 0, z: 0 },
      radius: 0.5,
      kind: "pulse" as const,
      pulseAmplitude: 1,
      pulseFrequency: 2,
      pulsePhase: 0
    };
    const hit = checkObstacleCollision(head, [obstacle], 0.5, 80, 80, 0.5);
    expect(hit).not.toBeNull();
  });
});
