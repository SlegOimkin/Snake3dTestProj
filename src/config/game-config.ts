import type { GameConfig, PowerupKind, QualityPreset } from "../types";

export interface QualityConfig {
  pixelRatioScale: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  vignetteStrength: number;
  chromaStrength: number;
  decorationCount: number;
  maxSegments: number;
  skyStarCount: number;
  skyNebulaShells: number;
  skyNoiseOctaves: number;
  skyPlanetSegments: number;
  skyLargeBodies: number;
}

export const GAME_CONFIG: GameConfig = {
  torusWidth: 84,
  torusDepth: 84,
  baseSpeed: 5.5,
  maxSpeed: 14.5,
  turnRate: 2.4
};

export const START_GRACE_SEC = 2.4;

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  low: {
    pixelRatioScale: 0.8,
    bloomStrength: 0.46,
    bloomRadius: 0.28,
    bloomThreshold: 0.62,
    vignetteStrength: 0.07,
    chromaStrength: 0.0006,
    decorationCount: 120,
    maxSegments: 180,
    skyStarCount: 1500,
    skyNebulaShells: 2,
    skyNoiseOctaves: 3,
    skyPlanetSegments: 18,
    skyLargeBodies: 1
  },
  medium: {
    pixelRatioScale: 1.0,
    bloomStrength: 0.72,
    bloomRadius: 0.34,
    bloomThreshold: 0.53,
    vignetteStrength: 0.085,
    chromaStrength: 0.0008,
    decorationCount: 240,
    maxSegments: 260,
    skyStarCount: 2800,
    skyNebulaShells: 3,
    skyNoiseOctaves: 4,
    skyPlanetSegments: 24,
    skyLargeBodies: 2
  },
  high: {
    pixelRatioScale: 1.2,
    bloomStrength: 0.95,
    bloomRadius: 0.4,
    bloomThreshold: 0.48,
    vignetteStrength: 0.1,
    chromaStrength: 0.001,
    decorationCount: 380,
    maxSegments: 340,
    skyStarCount: 4400,
    skyNebulaShells: 4,
    skyNoiseOctaves: 5,
    skyPlanetSegments: 32,
    skyLargeBodies: 2
  }
};

export const POWERUP_DURATIONS: Record<PowerupKind, number> = {
  overdrive: 8.5,
  phase: 5.5,
  magnet: 9.0
};

export const SCORE_RULES = {
  foodBaseScore: 10,
  powerupBonus: 45,
  comboWindowSec: 3.8,
  comboStepSize: 3,
  comboStepMultiplier: 0.5,
  comboMaxBonus: 3
};

export const SPAWN_RULES = {
  minHeadDistance: 14.5,
  minSegmentDistance: 2.4,
  minObstacleDistance: 3.2,
  minPickupDistance: 2.2,
  minFoodDistance: 2.0,
  baseObstacleCount: 8,
  maxObstacleCount: 24,
  startSafeAheadDistance: 16,
  startSafeHalfWidth: 5.4,
  foodCount: 1
};

export const GAME_VERSION = "0.1.0";
