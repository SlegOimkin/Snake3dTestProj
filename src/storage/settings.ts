import { z } from "zod";
import type { SettingsState } from "../types";

const SETTINGS_VERSION = 1;
const STORAGE_KEY = "snake3d:settings";

const SettingsDataSchema = z.object({
  quality: z.enum(["low", "medium", "high"]),
  language: z.enum(["ru", "en"]),
  inputSensitivity: z.number().min(0.55).max(1.65),
  postfxEnabled: z.boolean()
});

const SettingsEnvelopeSchema = z.object({
  version: z.number(),
  data: SettingsDataSchema
});

type SettingsEnvelope = z.infer<typeof SettingsEnvelopeSchema>;
type ParsedSettingsData = z.infer<typeof SettingsDataSchema>;

export const defaultSettings: SettingsState = {
  quality: "medium",
  language: "ru",
  inputSensitivity: 1,
  postfxEnabled: true
};

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultSettings };
    }
    const parsed = JSON.parse(raw);
    const normalized = migrateSettings(parsed);
    const result = SettingsEnvelopeSchema.safeParse(normalized);
    if (!result.success) {
      return { ...defaultSettings };
    }
    const envelope: SettingsEnvelope = result.data;
    return normalizeSettings(envelope.data);
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(data: SettingsState): void {
  const envelope = {
    version: SETTINGS_VERSION,
    data
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

export function migrateSettings(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return {
      version: SETTINGS_VERSION,
      data: defaultSettings
    };
  }

  const record = input as Record<string, unknown>;
  if (typeof record.version !== "number") {
    return {
      version: SETTINGS_VERSION,
      data: {
        ...defaultSettings,
        ...(record as Partial<SettingsState>)
      }
    };
  }

  if (record.version === SETTINGS_VERSION) {
    return input;
  }

  return {
    version: SETTINGS_VERSION,
    data: defaultSettings
  };
}

function normalizeSettings(data: ParsedSettingsData): SettingsState {
  return {
    quality: data.quality,
    language: data.language,
    inputSensitivity: data.inputSensitivity,
    postfxEnabled: data.postfxEnabled
  };
}
