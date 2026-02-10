import { beforeEach, describe, expect, it } from "vitest";
import { loadHighscores, saveHighscores } from "./highscores";

describe("highscores", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sanitizes player names before saving", () => {
    saveHighscores([
      {
        name: "<img src=x onerror=alert(1)>__Player__",
        score: 12,
        length: 9,
        createdAtIso: new Date("2026-02-10T12:00:00.000Z").toISOString(),
        gameVersion: "0.1.0"
      }
    ]);

    const list = loadHighscores();
    expect(list).toHaveLength(1);
    expect(list[0].name.length).toBeLessThanOrEqual(16);
    expect(list[0].name.includes("<")).toBe(false);
    expect(list[0].name.includes(">")).toBe(false);
  });
});
