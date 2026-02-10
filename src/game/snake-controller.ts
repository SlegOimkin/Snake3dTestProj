import type { SnakeHeadState, SnakeSegmentState, Vec3 } from "../types";
import { clamp } from "../util/math";
import { torusDistanceXZ, torusLerp, wrapPosition } from "../world/torus-space";

interface TrailSample {
  position: Vec3;
  distance: number;
}

export interface SnakeConfig {
  width: number;
  depth: number;
  turnSmoothing: number;
  segmentSpacing: number;
  maxSegments: number;
}

export class SnakeController {
  readonly head: SnakeHeadState;
  readonly segments: SnakeSegmentState[] = [];
  private readonly trail: TrailSample[] = [];
  private totalDistance = 0;
  private readonly config: SnakeConfig;

  constructor(config: SnakeConfig) {
    this.config = config;
    this.head = {
      position: { x: 0, y: 0.7, z: 0 },
      headingRad: 0,
      speed: 0,
      angularVelocity: 0
    };
  }

  reset(startLength = 8, startPosition?: Vec3, startHeadingRad = 0): void {
    this.head.position = startPosition
      ? { x: startPosition.x, y: startPosition.y, z: startPosition.z }
      : { x: 0, y: 0.7, z: 0 };
    this.head.headingRad = startHeadingRad;
    this.head.speed = 0;
    this.head.angularVelocity = 0;
    this.segments.length = 0;
    this.totalDistance = 0;
    this.trail.length = 0;

    const target = clamp(startLength, 2, this.config.maxSegments);
    this.seedInitialTrail(target);
    const dirX = Math.cos(this.head.headingRad);
    const dirZ = Math.sin(this.head.headingRad);
    for (let i = 0; i < target; i += 1) {
      const distance = (i + 1) * this.config.segmentSpacing;
      const position = wrapPosition(
        {
          x: this.head.position.x - dirX * distance,
          y: this.head.position.y,
          z: this.head.position.z - dirZ * distance
        },
        this.config.width,
        this.config.depth
      );
      this.segments.push({
        id: i + 1,
        position
      });
    }
  }

  grow(amount = 1): void {
    const nextLength = clamp(this.segments.length + amount, 0, this.config.maxSegments);
    while (this.segments.length < nextLength) {
      const last = this.segments[this.segments.length - 1] ?? {
        id: 0,
        position: { ...this.head.position }
      };
      this.segments.push({
        id: this.segments.length + 1,
        position: { ...last.position }
      });
    }
  }

  update(dt: number, inputTurn: number, targetSpeed: number, turnRate: number): void {
    const desiredAngular = clamp(inputTurn, -1, 1) * turnRate;
    this.head.angularVelocity +=
      (desiredAngular - this.head.angularVelocity) *
      (1 - Math.exp(-this.config.turnSmoothing * dt));
    this.head.headingRad += this.head.angularVelocity * dt;
    this.head.speed = targetSpeed;

    const dx = Math.cos(this.head.headingRad) * targetSpeed * dt;
    const dz = Math.sin(this.head.headingRad) * targetSpeed * dt;
    const movedDistance = Math.hypot(dx, dz);

    this.head.position = wrapPosition(
      {
        x: this.head.position.x + dx,
        y: this.head.position.y,
        z: this.head.position.z + dz
      },
      this.config.width,
      this.config.depth
    );

    this.totalDistance += movedDistance;
    this.addTrailSampleIfNeeded();
    this.updateSegmentsFromTrail();
    this.pruneTrail();
  }

  private addTrailSampleIfNeeded(): void {
    const lastSample = this.trail[this.trail.length - 1];
    if (!lastSample) {
      this.trail.push({
        position: { ...this.head.position },
        distance: this.totalDistance
      });
      return;
    }
    const spacing = this.config.segmentSpacing * 0.55;
    const dx = torusDistanceXZ(
      this.head.position,
      lastSample.position,
      this.config.width,
      this.config.depth
    );
    if (dx < spacing) {
      return;
    }
    this.trail.push({
      position: { ...this.head.position },
      distance: this.totalDistance
    });
  }

  private updateSegmentsFromTrail(): void {
    if (this.trail.length < 2) {
      return;
    }

    for (let i = 0; i < this.segments.length; i += 1) {
      const backDistance = (i + 1) * this.config.segmentSpacing;
      const targetDistance = this.totalDistance - backDistance;
      const sample = this.sampleTrail(targetDistance);
      this.segments[i].position = sample;
    }
  }

  private sampleTrail(targetDistance: number): Vec3 {
    if (targetDistance <= this.trail[0].distance) {
      return { ...this.trail[0].position };
    }
    const last = this.trail[this.trail.length - 1];
    if (targetDistance >= last.distance) {
      return { ...last.position };
    }

    for (let i = this.trail.length - 2; i >= 0; i -= 1) {
      const a = this.trail[i];
      const b = this.trail[i + 1];
      if (targetDistance >= a.distance && targetDistance <= b.distance) {
        const span = b.distance - a.distance || 0.0001;
        const t = clamp((targetDistance - a.distance) / span, 0, 1);
        return torusLerp(a.position, b.position, t, this.config.width, this.config.depth);
      }
    }
    return { ...last.position };
  }

  private pruneTrail(): void {
    const neededLength = (this.segments.length + 4) * this.config.segmentSpacing;
    const minDistance = this.totalDistance - neededLength;
    while (this.trail.length > 2 && this.trail[1].distance < minDistance) {
      this.trail.shift();
    }
  }

  private seedInitialTrail(segmentCount: number): void {
    const sampleStep = this.config.segmentSpacing * 0.5;
    const tailLength = (segmentCount + 3) * this.config.segmentSpacing;
    const dirX = Math.cos(this.head.headingRad);
    const dirZ = Math.sin(this.head.headingRad);

    for (let d = -tailLength; d <= 0; d += sampleStep) {
      this.trail.push({
        position: {
          x: this.head.position.x + dirX * d,
          y: this.head.position.y,
          z: this.head.position.z + dirZ * d
        },
        distance: d
      });
    }

    if (this.trail[this.trail.length - 1]?.distance !== 0) {
      this.trail.push({
        position: { ...this.head.position },
        distance: 0
      });
    }
  }
}
