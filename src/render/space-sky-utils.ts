import type { QualityConfig } from "../config/game-config";

export interface StarLayerProfile {
  count: number;
  radius: number;
  jitter: number;
  sizeMin: number;
  sizeMax: number;
  twinkleSpeed: number;
}

export interface SkyProfile {
  starLayers: readonly [StarLayerProfile, StarLayerProfile, StarLayerProfile];
  nebulaShells: number;
  noiseOctaves: number;
  planetSegments: number;
  largeBodies: number;
}

export interface StarFieldData {
  positions: Float32Array;
  sizes: Float32Array;
  phases: Float32Array;
  colors: Float32Array;
}

export function createSkyProfile(quality: QualityConfig): SkyProfile {
  const totalStars = Math.max(300, Math.round(quality.skyStarCount));
  const nearCount = Math.round(totalStars * 0.18);
  const midCount = Math.round(totalStars * 0.32);
  const farCount = totalStars - nearCount - midCount;

  return {
    starLayers: [
      {
        count: farCount,
        radius: 168,
        jitter: 12,
        sizeMin: 1.1,
        sizeMax: 2.0,
        twinkleSpeed: 0.75
      },
      {
        count: midCount,
        radius: 151,
        jitter: 10,
        sizeMin: 1.4,
        sizeMax: 2.5,
        twinkleSpeed: 1.1
      },
      {
        count: nearCount,
        radius: 136,
        jitter: 8,
        sizeMin: 1.7,
        sizeMax: 3.2,
        twinkleSpeed: 1.55
      }
    ],
    nebulaShells: clampInt(quality.skyNebulaShells, 2, 4),
    noiseOctaves: clampInt(quality.skyNoiseOctaves, 3, 5),
    planetSegments: clampInt(quality.skyPlanetSegments, 12, 64),
    largeBodies: clampInt(quality.skyLargeBodies, 1, 2)
  };
}

export function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateStarFieldData(
  layer: StarLayerProfile,
  rng: () => number = Math.random
): StarFieldData {
  const positions = new Float32Array(layer.count * 3);
  const sizes = new Float32Array(layer.count);
  const phases = new Float32Array(layer.count);
  const colors = new Float32Array(layer.count * 3);

  for (let i = 0; i < layer.count; i += 1) {
    const idx3 = i * 3;
    const direction = randomDirection(rng);
    const radius = layer.radius + (rng() * 2 - 1) * layer.jitter;
    positions[idx3] = direction[0] * radius;
    positions[idx3 + 1] = direction[1] * radius;
    positions[idx3 + 2] = direction[2] * radius;

    sizes[i] = layer.sizeMin + rng() * (layer.sizeMax - layer.sizeMin);
    phases[i] = rng() * Math.PI * 2;

    const warmMix = rng();
    const intensity = 0.58 + rng() * 0.42;
    const cool: [number, number, number] = [0.66, 0.86, 1.0];
    const warm: [number, number, number] = [1.0, 0.83, 0.63];
    colors[idx3] = mix(cool[0], warm[0], warmMix) * intensity;
    colors[idx3 + 1] = mix(cool[1], warm[1], warmMix) * intensity;
    colors[idx3 + 2] = mix(cool[2], warm[2], warmMix) * intensity;
  }

  return { positions, sizes, phases, colors };
}

export function hexToRgb01(hex: string): [number, number, number] {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : value;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return [r / 255, g / 255, b / 255];
}

export function isFiniteArray(values: ArrayLike<number>): boolean {
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      return false;
    }
  }
  return true;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function randomDirection(rng: () => number): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  let lenSq = 0;
  do {
    x = rng() * 2 - 1;
    y = rng() * 2 - 1;
    z = rng() * 2 - 1;
    lenSq = x * x + y * y + z * z;
  } while (lenSq < 0.0001);

  const invLen = 1 / Math.sqrt(lenSq);
  return [x * invLen, y * invLen, z * invLen];
}
