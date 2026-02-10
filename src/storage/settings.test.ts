import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings, loadSettings, migrateSettings, saveSettings } from "./settings";

describe("settings storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("falls back to defaults for corrupted data", () => {
    localStorage.setItem("snake3d:settings", "{bad-json");
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it("saves and loads valid state", () => {
    saveSettings({
      quality: "high",
      language: "en",
      inputSensitivity: 1.2,
      postfxEnabled: false
    });
    expect(loadSettings()).toEqual({
      quality: "high",
      language: "en",
      inputSensitivity: 1.2,
      postfxEnabled: false
    });
  });

  it("migrates legacy non-versioned object", () => {
    const migrated = migrateSettings({
      quality: "low",
      language: "ru",
      inputSensitivity: 1.01,
      postfxEnabled: true
    }) as {
      version: number;
      data: unknown;
    };
    expect(migrated.version).toBe(1);
    expect((migrated.data as { quality: string }).quality).toBe("low");
  });
});
