import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/game-config";
import { torusDistanceXZ } from "../world/torus-space";
import { SpawnSystem } from "./spawn-system";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

describe("spawn-system", () => {
  it("spawns safe food and obstacles around the head", () => {
    const random = seededRandom(42);
    const system = new SpawnSystem(random);
    const head = {
      position: { x: 0, y: 0.7, z: 0 },
      headingRad: 0,
      speed: 0,
      angularVelocity: 0
    };
    const segments = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      position: { x: -i * 1, y: 0.7, z: 0 }
    }));

    system.reset(head, segments);
    expect(system.foods.length).toBeGreaterThan(0);
    expect(system.obstacles.length).toBeGreaterThan(0);

    for (const food of system.foods) {
      const d = torusDistanceXZ(food.position, head.position, GAME_CONFIG.torusWidth, GAME_CONFIG.torusDepth);
      expect(d).toBeGreaterThan(4);
    }
  });
});
