import { describe, expect, it } from "vitest";
import { torusDelta, torusDistanceXZ, torusLerp, wrapScalar } from "./torus-space";

describe("torus-space", () => {
  it("wraps scalar into half-open range", () => {
    expect(wrapScalar(44, 80)).toBeCloseTo(-36);
    expect(wrapScalar(-41, 80)).toBeCloseTo(39);
  });

  it("computes shortest delta across seam", () => {
    expect(torusDelta(39, -39, 80)).toBeCloseTo(2);
    expect(torusDelta(-39, 39, 80)).toBeCloseTo(-2);
  });

  it("computes torus distance in xz plane", () => {
    const d = torusDistanceXZ(
      { x: 39, y: 0, z: -39 },
      { x: -39, y: 0, z: 39 },
      80,
      80
    );
    expect(d).toBeCloseTo(Math.hypot(2, -2));
  });

  it("lerps over shortest wrapped path", () => {
    const mid = torusLerp({ x: 39, y: 0, z: 0 }, { x: -39, y: 0, z: 0 }, 0.5, 80, 80);
    expect(Math.abs(mid.x)).toBeGreaterThan(39);
  });
});
