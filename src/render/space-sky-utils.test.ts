import { describe, expect, it } from "vitest";
import { QUALITY_PRESETS } from "../config/game-config";
import {
  createDeterministicRng,
  createSkyProfile,
  generateStarFieldData,
  hexToRgb01,
  isFiniteArray
} from "./space-sky-utils";

describe("space sky profile", () => {
  it("maps each quality preset to expected sky profile values", () => {
    (["low", "medium", "high"] as const).forEach((preset) => {
      const config = QUALITY_PRESETS[preset];
      const profile = createSkyProfile(config);
      const starTotal = profile.starLayers.reduce((sum, layer) => sum + layer.count, 0);
      expect(starTotal).toBe(config.skyStarCount);
      expect(profile.nebulaShells).toBe(config.skyNebulaShells);
      expect(profile.noiseOctaves).toBe(config.skyNoiseOctaves);
      expect(profile.planetSegments).toBe(config.skyPlanetSegments);
      expect(profile.largeBodies).toBe(config.skyLargeBodies);
    });
  });
});

describe("star field generation", () => {
  it("keeps stars inside configured spherical shell", () => {
    const layer = createSkyProfile(QUALITY_PRESETS.high).starLayers[1];
    const data = generateStarFieldData(layer, createDeterministicRng(1337));
    for (let i = 0; i < layer.count; i += 1) {
      const idx = i * 3;
      const x = data.positions[idx];
      const y = data.positions[idx + 1];
      const z = data.positions[idx + 2];
      const radius = Math.sqrt(x * x + y * y + z * z);
      expect(radius).toBeGreaterThanOrEqual(layer.radius - layer.jitter - 0.0001);
      expect(radius).toBeLessThanOrEqual(layer.radius + layer.jitter + 0.0001);
      expect(data.sizes[i]).toBeGreaterThanOrEqual(layer.sizeMin);
      expect(data.sizes[i]).toBeLessThanOrEqual(layer.sizeMax);
      expect(data.phases[i]).toBeGreaterThanOrEqual(0);
      expect(data.phases[i]).toBeLessThanOrEqual(Math.PI * 2);
    }
  });

  it("produces only finite numeric buffers", () => {
    const layer = createSkyProfile(QUALITY_PRESETS.medium).starLayers[2];
    const data = generateStarFieldData(layer, createDeterministicRng(987654321));
    expect(isFiniteArray(data.positions)).toBe(true);
    expect(isFiniteArray(data.sizes)).toBe(true);
    expect(isFiniteArray(data.phases)).toBe(true);
    expect(isFiniteArray(data.colors)).toBe(true);
  });
});

describe("color helpers", () => {
  it("converts hex strings to normalized RGB", () => {
    expect(hexToRgb01("#fff")).toEqual([1, 1, 1]);
    expect(hexToRgb01("336699")).toEqual([0.2, 0.4, 0.6]);
  });
});
