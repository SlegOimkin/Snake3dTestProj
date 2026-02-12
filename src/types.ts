export type GameState = "boot" | "menu" | "playing" | "paused" | "gameover";
export type QualityPreset = "low" | "medium" | "high";
export type PowerupKind = "overdrive" | "phase" | "magnet";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SnakeHeadState {
  position: Vec3;
  headingRad: number;
  speed: number;
  angularVelocity: number;
}

export interface SnakeSegmentState {
  id: number;
  position: Vec3;
}

export interface PowerupState {
  kind: PowerupKind;
  ttlSec: number;
}

export interface ScoreState {
  score: number;
  combo: number;
  multiplier: number;
}

export interface HighscoreEntry {
  name: string;
  score: number;
  length: number;
  createdAtIso: string;
  gameVersion: string;
}

export interface SettingsState {
  quality: QualityPreset;
  language: "ru" | "en";
  inputSensitivity: number;
  postfxEnabled: boolean;
}

export interface GameConfig {
  torusWidth: number;
  torusDepth: number;
  baseSpeed: number;
  maxSpeed: number;
  turnRate: number;
}

export interface FoodState {
  id: number;
  position: Vec3;
}

export interface PickupState {
  id: number;
  position: Vec3;
  kind: PowerupKind;
}

export interface ObstacleState {
  id: number;
  position: Vec3;
  radius: number;
  kind: "static" | "pulse";
  pulseAmplitude: number;
  pulseFrequency: number;
  pulsePhase: number;
}

export interface FrameInput {
  turn: number;
  assist: number;
}

export interface SessionSnapshot {
  head: SnakeHeadState;
  segments: SnakeSegmentState[];
  foods: FoodState[];
  pickups: PickupState[];
  obstacles: ObstacleState[];
  score: ScoreState;
  activePowerup: PowerupState | null;
  elapsedSec: number;
  speed01: number;
}

export interface MultiplayerPlayerState {
  id: string;
  name: string;
  color: string;
  position: Vec3;
  segments: Vec3[];
  headingRad: number;
  speed: number;
  length: number;
  score: number;
  alive: boolean;
  updatedAt: number;
}
