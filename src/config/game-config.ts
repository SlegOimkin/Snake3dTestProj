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
}

export const GAME_CONFIG: GameConfig = {
  torusWidth: 84,
  torusDepth: 84,
  baseSpeed: 5.5,
  maxSpeed: 14.5,
  turnRate: 2.4
};

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  low: {
    pixelRatioScale: 0.8,
    bloomStrength: 0.5,
    bloomRadius: 0.3,
    bloomThreshold: 0.6,
    vignetteStrength: 0.2,
    chromaStrength: 0.001,
    decorationCount: 120,
    maxSegments: 180
  },
  medium: {
    pixelRatioScale: 1.0,
    bloomStrength: 0.8,
    bloomRadius: 0.35,
    bloomThreshold: 0.5,
    vignetteStrength: 0.24,
    chromaStrength: 0.0014,
    decorationCount: 240,
    maxSegments: 260
  },
  high: {
    pixelRatioScale: 1.2,
    bloomStrength: 1.05,
    bloomRadius: 0.42,
    bloomThreshold: 0.45,
    vignetteStrength: 0.29,
    chromaStrength: 0.0018,
    decorationCount: 380,
    maxSegments: 340
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
  minHeadDistance: 6.8,
  minSegmentDistance: 2.4,
  minObstacleDistance: 3.2,
  minPickupDistance: 2.2,
  minFoodDistance: 2.0,
  baseObstacleCount: 14,
  maxObstacleCount: 34,
  foodCount: 1
};

export const GAME_VERSION = "0.1.0";
