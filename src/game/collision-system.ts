import type { FoodState, ObstacleState, PickupState, SnakeHeadState, SnakeSegmentState, Vec3 } from "../types";
import { torusDistanceXZ } from "../world/torus-space";

export function checkSelfCollision(
  head: SnakeHeadState,
  segments: SnakeSegmentState[],
  width: number,
  depth: number,
  skipSegments = 4,
  radius = 0.64
): boolean {
  for (let i = skipSegments; i < segments.length; i += 1) {
    const dist = torusDistanceXZ(head.position, segments[i].position, width, depth);
    if (dist <= radius) {
      return true;
    }
  }
  return false;
}

function pulseScale(obstacle: ObstacleState, elapsedSec: number): number {
  if (obstacle.kind !== "pulse") {
    return 1;
  }
  const wave = Math.sin(elapsedSec * obstacle.pulseFrequency + obstacle.pulsePhase) * 0.5 + 0.5;
  return 1 + obstacle.pulseAmplitude * wave;
}

export function checkObstacleCollision(
  head: SnakeHeadState,
  obstacles: ObstacleState[],
  elapsedSec: number,
  width: number,
  depth: number,
  headRadius = 0.7
): ObstacleState | null {
  for (const obstacle of obstacles) {
    const dist = torusDistanceXZ(head.position, obstacle.position, width, depth);
    const radius = obstacle.radius * pulseScale(obstacle, elapsedSec) + headRadius;
    if (dist <= radius) {
      return obstacle;
    }
  }
  return null;
}

export function checkFoodCollision(
  head: SnakeHeadState,
  foods: FoodState[],
  width: number,
  depth: number,
  pickupRadius = 1.08
): FoodState | null {
  for (const food of foods) {
    const dist = torusDistanceXZ(head.position, food.position, width, depth);
    if (dist <= pickupRadius) {
      return food;
    }
  }
  return null;
}

export function checkPickupCollision(
  head: SnakeHeadState,
  pickups: PickupState[],
  width: number,
  depth: number,
  pickupRadius = 1.1
): PickupState | null {
  for (const pickup of pickups) {
    const dist = torusDistanceXZ(head.position, pickup.position, width, depth);
    if (dist <= pickupRadius) {
      return pickup;
    }
  }
  return null;
}

export interface RemoteTailState {
  id: string;
  alive: boolean;
  segments: Vec3[];
}

export function checkRemoteTailCollision(
  head: SnakeHeadState,
  remotes: RemoteTailState[],
  width: number,
  depth: number,
  radius = 0.68
): RemoteTailState | null {
  for (const remote of remotes) {
    if (!remote.alive || remote.segments.length === 0) {
      continue;
    }
    for (const segment of remote.segments) {
      const dist = torusDistanceXZ(head.position, segment, width, depth);
      if (dist <= radius) {
        return remote;
      }
    }
  }
  return null;
}
