import { GAME_CONFIG, POWERUP_DURATIONS, START_GRACE_SEC } from "../config/game-config";
import type {
  FrameInput,
  PowerupState,
  SessionSnapshot,
  SnakeHeadState,
  SnakeSegmentState,
  Vec3
} from "../types";
import { clamp } from "../util/math";
import { checkFoodCollision, checkObstacleCollision, checkPickupCollision, checkSelfCollision } from "./collision-system";
import { ScoringSystem } from "./scoring-system";
import { SnakeController } from "./snake-controller";
import { SpawnSystem } from "./spawn-system";

export interface SessionEvents {
  onPickup?: (kind: "food" | "overdrive" | "phase" | "magnet") => void;
  onCollision?: (kind: "self" | "obstacle") => void;
  onComboChanged?: (combo: number, multiplier: number) => void;
}

export interface SessionTickResult {
  gameOver: boolean;
}

export class GameSession {
  readonly snake: SnakeController;
  readonly spawn: SpawnSystem;
  readonly scoring: ScoringSystem;

  private activePowerup: PowerupState | null = null;
  private elapsedSec = 0;
  private difficulty01 = 0;
  private spawnGraceSec = START_GRACE_SEC;
  private readonly events: SessionEvents;

  constructor(events: SessionEvents = {}) {
    this.events = events;
    this.scoring = new ScoringSystem();
    this.spawn = new SpawnSystem();
    this.snake = new SnakeController({
      width: GAME_CONFIG.torusWidth,
      depth: GAME_CONFIG.torusDepth,
      turnSmoothing: 10.5,
      segmentSpacing: 0.9,
      maxSegments: 340
    });
  }

  reset(options?: { startPosition?: Vec3; headingRad?: number }): void {
    this.elapsedSec = 0;
    this.difficulty01 = 0;
    this.spawnGraceSec = START_GRACE_SEC;
    this.activePowerup = null;
    this.scoring.reset();
    this.snake.reset(8, options?.startPosition, options?.headingRad ?? 0);
    this.spawn.reset(this.snake.head, this.snake.segments);
  }

  update(dt: number, frameInput: FrameInput): SessionTickResult {
    this.elapsedSec += dt;
    this.difficulty01 = clamp(this.elapsedSec / 180, 0, 1);
    this.spawnGraceSec = Math.max(0, this.spawnGraceSec - dt);
    this.updatePowerupTimers(dt);

    const powerupSpeedBonus = this.activePowerup?.kind === "overdrive" ? 1.28 : 1;
    const speedTarget =
      (GAME_CONFIG.baseSpeed + this.difficulty01 * (GAME_CONFIG.maxSpeed - GAME_CONFIG.baseSpeed)) *
      powerupSpeedBonus;

    const turnRateBonus = 1 + frameInput.assist * 0.18;
    const turnRate = GAME_CONFIG.turnRate * turnRateBonus;
    this.snake.update(dt, frameInput.turn, speedTarget, turnRate);

    if (this.activePowerup?.kind === "magnet") {
      this.spawn.attractFoodsTo(this.snake.head, 4.6, dt);
    }

    this.spawn.update(dt, {
      head: this.snake.head,
      segments: this.snake.segments,
      elapsedSec: this.elapsedSec,
      difficulty01: this.difficulty01
    });

    const scoreBefore = this.scoring.state;
    this.scoring.setMultiplierBonus(this.activePowerup?.kind === "overdrive" ? 0.75 : 0);
    this.scoring.update(dt);

    const food = checkFoodCollision(
      this.snake.head,
      this.spawn.foods,
      GAME_CONFIG.torusWidth,
      GAME_CONFIG.torusDepth
    );
    if (food) {
      this.spawn.consumeFood(food.id);
      this.snake.grow(1);
      this.scoring.onFoodCollected();
      this.events.onPickup?.("food");
    }

    const pickup = checkPickupCollision(
      this.snake.head,
      this.spawn.pickups,
      GAME_CONFIG.torusWidth,
      GAME_CONFIG.torusDepth
    );
    if (pickup) {
      this.spawn.consumePickup(pickup.id);
      this.activatePowerup(pickup.kind);
      this.scoring.onPowerupCollected();
      this.events.onPickup?.(pickup.kind);
    }

    const scoreAfter = this.scoring.state;
    if (
      scoreAfter.combo !== scoreBefore.combo ||
      Math.abs(scoreAfter.multiplier - scoreBefore.multiplier) > Number.EPSILON
    ) {
      this.events.onComboChanged?.(scoreAfter.combo, scoreAfter.multiplier);
    }

    const phase = this.activePowerup?.kind === "phase";
    const collisionsBlocked = this.spawnGraceSec > 0;
    const selfHit = checkSelfCollision(
      this.snake.head,
      this.snake.segments,
      GAME_CONFIG.torusWidth,
      GAME_CONFIG.torusDepth
    );
    if (selfHit && !phase && !collisionsBlocked) {
      this.events.onCollision?.("self");
      return { gameOver: true };
    }

    const obstacleHit = checkObstacleCollision(
      this.snake.head,
      this.spawn.obstacles,
      this.elapsedSec,
      GAME_CONFIG.torusWidth,
      GAME_CONFIG.torusDepth
    );
    if (obstacleHit && !phase && !collisionsBlocked) {
      this.events.onCollision?.("obstacle");
      return { gameOver: true };
    }

    return { gameOver: false };
  }

  getSnapshot(): SessionSnapshot {
    return {
      head: this.cloneHead(this.snake.head),
      segments: this.cloneSegments(this.snake.segments),
      foods: this.spawn.foods.map((food) => ({
        ...food,
        position: { ...food.position }
      })),
      pickups: this.spawn.pickups.map((pickup) => ({
        ...pickup,
        position: { ...pickup.position }
      })),
      obstacles: this.spawn.obstacles.map((obstacle) => ({
        ...obstacle,
        position: { ...obstacle.position }
      })),
      score: this.scoring.state,
      activePowerup: this.activePowerup ? { ...this.activePowerup } : null,
      elapsedSec: this.elapsedSec,
      speed01: clamp(
        (this.snake.head.speed - GAME_CONFIG.baseSpeed) / (GAME_CONFIG.maxSpeed - GAME_CONFIG.baseSpeed),
        0,
        1
      )
    };
  }

  private activatePowerup(kind: "overdrive" | "phase" | "magnet"): void {
    this.activePowerup = {
      kind,
      ttlSec: POWERUP_DURATIONS[kind]
    };
  }

  private updatePowerupTimers(dt: number): void {
    if (!this.activePowerup) {
      return;
    }
    this.activePowerup.ttlSec -= dt;
    if (this.activePowerup.ttlSec <= 0) {
      this.activePowerup = null;
    }
  }

  private cloneHead(head: SnakeHeadState): SnakeHeadState {
    return {
      ...head,
      position: this.cloneVec3(head.position)
    };
  }

  private cloneSegments(segments: SnakeSegmentState[]): SnakeSegmentState[] {
    return segments.map((segment) => ({
      id: segment.id,
      position: this.cloneVec3(segment.position)
    }));
  }

  private cloneVec3(v: Vec3): Vec3 {
    return { x: v.x, y: v.y, z: v.z };
  }
}
