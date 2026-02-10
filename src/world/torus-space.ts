import type { Vec3 } from "../types";

export function wrapScalar(value: number, size: number): number {
  const half = size / 2;
  let next = value;
  while (next >= half) next -= size;
  while (next < -half) next += size;
  return next;
}

export function wrapPosition(position: Vec3, width: number, depth: number): Vec3 {
  return {
    x: wrapScalar(position.x, width),
    y: position.y,
    z: wrapScalar(position.z, depth)
  };
}

export function torusDelta(from: number, to: number, size: number): number {
  let delta = to - from;
  const half = size / 2;
  if (delta > half) delta -= size;
  if (delta < -half) delta += size;
  return delta;
}

export function torusDistanceXZ(a: Vec3, b: Vec3, width: number, depth: number): number {
  const dx = torusDelta(a.x, b.x, width);
  const dz = torusDelta(a.z, b.z, depth);
  return Math.hypot(dx, dz);
}

export function torusLerp(a: Vec3, b: Vec3, t: number, width: number, depth: number): Vec3 {
  const dx = torusDelta(a.x, b.x, width);
  const dz = torusDelta(a.z, b.z, depth);
  return {
    x: wrapScalar(a.x + dx * t, width),
    y: a.y + (b.y - a.y) * t,
    z: wrapScalar(a.z + dz * t, depth)
  };
}
