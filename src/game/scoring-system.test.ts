import { describe, expect, it } from "vitest";
import { ScoringSystem } from "./scoring-system";

describe("scoring-system", () => {
  it("builds combo multiplier and decays after ttl", () => {
    const scoring = new ScoringSystem();
    scoring.onFoodCollected();
    scoring.onFoodCollected();
    scoring.onFoodCollected();
    expect(scoring.state.multiplier).toBeGreaterThan(1);

    scoring.update(5);
    expect(scoring.state.combo).toBe(0);
    expect(scoring.state.multiplier).toBe(1);
  });
});
