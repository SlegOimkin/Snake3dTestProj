import { z } from "zod";
import type { HighscoreEntry } from "../types";

const HIGHSCORE_VERSION = 1;
const STORAGE_KEY = "snake3d:highscores";
const LIMIT = 10;

const EntrySchema = z.object({
  name: z.string().min(1).max(16),
  score: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  createdAtIso: z.string().min(8),
  gameVersion: z.string().min(1)
});

const HighscoreEnvelopeSchema = z.object({
  version: z.number(),
  data: z.array(EntrySchema)
});

export function loadHighscores(): HighscoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const result = HighscoreEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      return [];
    }
    return result.data.data;
  } catch {
    return [];
  }
}

export function saveHighscores(entries: HighscoreEntry[]): void {
  const normalized = [...entries]
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map((entry) => ({
      ...entry,
      name: entry.name.trim().slice(0, 16) || "Player"
    }));

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: HIGHSCORE_VERSION,
      data: normalized
    })
  );
}

export function addHighscore(entry: HighscoreEntry): HighscoreEntry[] {
  const list = loadHighscores();
  list.push(entry);
  saveHighscores(list);
  return loadHighscores();
}
