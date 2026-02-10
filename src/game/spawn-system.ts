import { GAME_CONFIG, SPAWN_RULES } from "../config/game-config";
import type {
  FoodState,
  ObstacleState,
  PickupState,
  PowerupKind,
  SnakeHeadState,
  SnakeSegmentState,
  Vec3
} from "../types";
import { clamp } from "../util/math";
import { pickRandom, randInRange, type RandomFn } from "../util/random";
import { torusDelta, torusDistanceXZ, wrapPosition } from "../world/torus-space";

interface SpawnContext {
  head: SnakeHeadState;
  segments: SnakeSegmentState[];
  elapsedSec: number;
  difficulty01: number;
}

export class SpawnSystem {
  private readonly random: RandomFn;
  private nextId = 1;
  private powerupTimerSec = randInRange(Math.random, 8, 14);

  readonly foods: FoodState[] = [];
  readonly pickups: PickupState[] = [];
  readonly obstacles: ObstacleState[] = [];

  constructor(random: RandomFn = Math.random) {
    this.random = random;
    this.powerupTimerSec = randInRange(this.random, 8, 14);
  }

  reset(head: SnakeHeadState, segments: SnakeSegmentState[]): void {
    this.nextId = 1;
    this.foods.length = 0;
    this.pickups.length = 0;
    this.obstacles.length = 0;
    this.powerupTimerSec = randInRange(this.random, 8, 14);
    this.seedObstacles(head, segments);
    this.ensureFoodCount(head, segments);
  }

  update(dt: number, context: SpawnContext): void {
    this.ensureFoodCount(context.head, context.segments);
    this.growObstaclePopulation(context);

    this.powerupTimerSec -= dt;
    if (this.powerupTimerSec <= 0) {
      this.trySpawnPowerup(context.head, context.segments);
      this.powerupTimerSec = randInRange(this.random, 10, 18);
    }
  }

  consumeFood(foodId: number): void {
    const idx = this.foods.findIndex((food) => food.id === foodId);
    if (idx >= 0) {
      this.foods.splice(idx, 1);
    }
  }

  consumePickup(pickupId: number): void {
    const idx = this.pickups.findIndex((pickup) => pickup.id === pickupId);
    if (idx >= 0) {
      this.pickups.splice(idx, 1);
    }
  }

  attractFoodsTo(head: SnakeHeadState, strength: number, dt: number): void {
    for (const food of this.foods) {
      const dx = torusDelta(food.position.x, head.position.x, GAME_CONFIG.torusWidth);
      const dz = torusDelta(food.position.z, head.position.z, GAME_CONFIG.torusDepth);
      const len = Math.hypot(dx, dz) || 0.0001;
      food.position.x += (dx / len) * strength * dt;
      food.position.z += (dz / len) * strength * dt;
      food.position = wrapPosition(food.position, GAME_CONFIG.torusWidth, GAME_CONFIG.torusDepth);
    }
  }

  private seedObstacles(head: SnakeHeadState, segments: SnakeSegmentState[]): void {
    for (let i = 0; i < SPAWN_RULES.baseObstacleCount; i += 1) {
      const obstacle = this.createObstacle(head, segments, this.obstacles, this.foods, this.pickups);
      if (obstacle) {
        this.obstacles.push(obstacle);
      }
    }
  }

  private growObstaclePopulation(context: SpawnContext): void {
    const target = Math.floor(
      SPAWN_RULES.baseObstacleCount +
        context.difficulty01 * (SPAWN_RULES.maxObstacleCount - SPAWN_RULES.baseObstacleCount)
    );
    if (this.obstacles.length >= target) {
      return;
    }

    const obstacle = this.createObstacle(
      context.head,
      context.segments,
      this.obstacles,
      this.foods,
      this.pickups
    );
    if (obstacle) {
      this.obstacles.push(obstacle);
    }
  }

  private ensureFoodCount(head: SnakeHeadState, segments: SnakeSegmentState[]): void {
    while (this.foods.length < SPAWN_RULES.foodCount) {
      const point = this.findSafePosition(head, segments, this.obstacles, this.foods, this.pickups);
      this.foods.push({
        id: this.nextId++,
        position: point
      });
    }
  }

  private trySpawnPowerup(head: SnakeHeadState, segments: SnakeSegmentState[]): void {
    if (this.pickups.length >= 2) {
      return;
    }
    const position = this.findSafePosition(head, segments, this.obstacles, this.foods, this.pickups);
    const kind = pickRandom<PowerupKind>(this.random, ["overdrive", "phase", "magnet"]);
    this.pickups.push({
      id: this.nextId++,
      position,
      kind
    });
  }

  private createObstacle(
    head: SnakeHeadState,
    segments: SnakeSegmentState[],
    obstacles: ObstacleState[],
    foods: FoodState[],
    pickups: PickupState[]
  ): ObstacleState | null {
    let position = this.findSafePosition(head, segments, obstacles, foods, pickups);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!this.isInStartSafeCorridor(head, position)) {
        break;
      }
      position = this.findSafePosition(head, segments, obstacles, foods, pickups);
    }
    const pulse = this.random() > 0.75;
    return {
      id: this.nextId++,
      position,
      radius: randInRange(this.random, 1.2, 2.5),
      kind: pulse ? "pulse" : "static",
      pulseAmplitude: pulse ? randInRange(this.random, 0.12, 0.28) : 0,
      pulseFrequency: pulse ? randInRange(this.random, 1.4, 2.8) : 0,
      pulsePhase: pulse ? randInRange(this.random, 0, Math.PI * 2) : 0
    };
  }

  private findSafePosition(
    head: SnakeHeadState,
    segments: SnakeSegmentState[],
    obstacles: ObstacleState[],
    foods: FoodState[],
    pickups: PickupState[]
  ): Vec3 {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const candidate = {
        x: randInRange(this.random, -GAME_CONFIG.torusWidth / 2, GAME_CONFIG.torusWidth / 2),
        y: 0.7,
        z: randInRange(this.random, -GAME_CONFIG.torusDepth / 2, GAME_CONFIG.torusDepth / 2)
      };

      const farFromHead =
        torusDistanceXZ(candidate, head.position, GAME_CONFIG.torusWidth, GAME_CONFIG.torusDepth) >=
        SPAWN_RULES.minHeadDistance;
      if (!farFromHead) continue;

      let ok = true;
      for (const segment of segments) {
        if (
          torusDistanceXZ(candidate, segment.position, GAME_CONFIG.torusWidth, GAME_CONFIG.torusDepth) <
          SPAWN_RULES.minSegmentDistance
        ) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      for (const obstacle of obstacles) {
        if (
          torusDistanceXZ(candidate, obstacle.position, GAME_CONFIG.torusWidth, GAME_CONFIG.torusDepth) <
          obstacle.radius + SPAWN_RULES.minObstacleDistance
        ) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      for (const food of foods) {
        if (
          torusDistanceXZ(candidate, food.position, GAME_CONFIG.torusWidth, GAME_CONFIG.torusDepth) <
          SPAWN_RULES.minFoodDistance
        ) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      for (const pickup of pickups) {
        if (
          torusDistanceXZ(candidate, pickup.position, GAME_CONFIG.torusWidth, GAME_CONFIG.torusDepth) <
          SPAWN_RULES.minPickupDistance
        ) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      return candidate;
    }

    return {
      x: clamp(randInRange(this.random, -GAME_CONFIG.torusWidth / 2, GAME_CONFIG.torusWidth / 2), -40, 40),
      y: 0.7,
      z: clamp(randInRange(this.random, -GAME_CONFIG.torusDepth / 2, GAME_CONFIG.torusDepth / 2), -40, 40)
    };
  }

  private isInStartSafeCorridor(head: SnakeHeadState, candidate: Vec3): boolean {
    const dx = torusDelta(head.position.x, candidate.x, GAME_CONFIG.torusWidth);
    const dz = torusDelta(head.position.z, candidate.z, GAME_CONFIG.torusDepth);
    const forwardX = Math.cos(head.headingRad);
    const forwardZ = Math.sin(head.headingRad);
    const ahead = dx * forwardX + dz * forwardZ;
    if (ahead <= 0 || ahead > SPAWN_RULES.startSafeAheadDistance) {
      return false;
    }
    const lateral = Math.abs(dx * -forwardZ + dz * forwardX);
    return lateral < SPAWN_RULES.startSafeHalfWidth;
  }
}
