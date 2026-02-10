import { describe, expect, it } from "vitest";
import { GAME_CONFIG, SPAWN_RULES } from "../config/game-config";
import { torusDelta, torusDistanceXZ } from "../world/torus-space";
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

  it("keeps a clear corridor in front of spawn for initial obstacles", () => {
    const random = seededRandom(1337);
    const system = new SpawnSystem(random);
    const head = {
      position: { x: 14, y: 0.7, z: -8 },
      headingRad: Math.PI / 6,
      speed: 0,
      angularVelocity: 0
    };
    const segments = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      position: { x: 14 - i, y: 0.7, z: -8 }
    }));

    system.reset(head, segments);

    const forwardX = Math.cos(head.headingRad);
    const forwardZ = Math.sin(head.headingRad);
    for (const obstacle of system.obstacles) {
      const dx = torusDelta(head.position.x, obstacle.position.x, GAME_CONFIG.torusWidth);
      const dz = torusDelta(head.position.z, obstacle.position.z, GAME_CONFIG.torusDepth);
      const ahead = dx * forwardX + dz * forwardZ;
      const lateral = Math.abs(dx * -forwardZ + dz * forwardX);
      const inSafeCorridor =
        ahead > 0 && ahead <= SPAWN_RULES.startSafeAheadDistance && lateral < SPAWN_RULES.startSafeHalfWidth;
      expect(inSafeCorridor).toBe(false);
    }
  });
});
