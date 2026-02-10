import { describe, expect, it } from "vitest";
import { translations } from "./index";

describe("localization parity", () => {
  it("contains same keys in ru and en dictionaries", () => {
    const ruKeys = Object.keys(translations.ru).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(ruKeys).toEqual(enKeys);
  });
});
