import { SCORE_RULES } from "../config/game-config";
import type { ScoreState } from "../types";
import { clamp } from "../util/math";

export class ScoringSystem {
  private scoreState: ScoreState = {
    score: 0,
    combo: 0,
    multiplier: 1
  };
  private comboTtlSec = 0;
  private multiplierBonus = 0;

  get state(): ScoreState {
    return { ...this.scoreState };
  }

  reset(): void {
    this.scoreState = {
      score: 0,
      combo: 0,
      multiplier: 1
    };
    this.comboTtlSec = 0;
    this.multiplierBonus = 0;
  }

  update(dt: number): void {
    if (this.scoreState.combo <= 0) {
      return;
    }
    this.comboTtlSec -= dt;
    if (this.comboTtlSec <= 0) {
      this.scoreState.combo = 0;
      this.scoreState.multiplier = 1;
      this.comboTtlSec = 0;
    }
  }

  setMultiplierBonus(bonus: number): void {
    this.multiplierBonus = bonus;
  }

  onFoodCollected(): number {
    this.scoreState.combo += 1;
    this.comboTtlSec = SCORE_RULES.comboWindowSec;
    const comboTier = Math.floor(this.scoreState.combo / SCORE_RULES.comboStepSize);
    const comboBonus = clamp(comboTier * SCORE_RULES.comboStepMultiplier, 0, SCORE_RULES.comboMaxBonus);
    this.scoreState.multiplier = 1 + comboBonus;
    const gain = Math.round(
      SCORE_RULES.foodBaseScore * (this.scoreState.multiplier + this.multiplierBonus)
    );
    this.scoreState.score += gain;
    return gain;
  }

  onPowerupCollected(): number {
    const gain = Math.round(SCORE_RULES.powerupBonus * (this.scoreState.multiplier + this.multiplierBonus));
    this.scoreState.score += gain;
    return gain;
  }
}
