export interface StoredPlayerState {
  id: string;
  name: string;
  color: string;
  position: { x: number; y: number; z: number };
  headingRad: number;
  speed: number;
  length: number;
  score: number;
  alive: boolean;
  updatedAt: number;
}

interface MemoryStore {
  playerIds: Set<string>;
  players: Map<string, StoredPlayerState>;
}

const STALE_MS = 20_000;

const COLOR_PALETTE = [
  "#73ffe2",
  "#ffbe7b",
  "#9be3ff",
  "#b8ff8b",
  "#f9a8ff",
  "#ffd86f",
  "#8dc7ff",
  "#ff9e9e"
];

declare global {
  // eslint-disable-next-line no-var
  var __snake3dMpMemory: MemoryStore | undefined;
}

function getStore(): MemoryStore {
  if (!globalThis.__snake3dMpMemory) {
    globalThis.__snake3dMpMemory = {
      playerIds: new Set<string>(),
      players: new Map<string, StoredPlayerState>()
    };
  }
  return globalThis.__snake3dMpMemory;
}

export function getStorageMode(): "memory" {
  return "memory";
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_ .-]/gu, "")
    .trim()
    .slice(0, 16);
}

export function pickColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function upsertPlayer(player: StoredPlayerState): Promise<void> {
  const store = getStore();
  store.playerIds.add(player.id);
  store.players.set(player.id, { ...player });
}

export async function removePlayer(id: string): Promise<void> {
  const store = getStore();
  store.playerIds.delete(id);
  store.players.delete(id);
}

export async function getPlayer(id: string): Promise<StoredPlayerState | null> {
  const player = getStore().players.get(id);
  return player ? { ...player } : null;
}

export async function listActivePlayers(nowMs: number): Promise<StoredPlayerState[]> {
  const store = getStore();
  const active: StoredPlayerState[] = [];
  const staleIds: string[] = [];

  for (const id of store.playerIds) {
    const player = store.players.get(id);
    if (!player) {
      staleIds.push(id);
      continue;
    }
    if (nowMs - player.updatedAt > STALE_MS) {
      staleIds.push(id);
      continue;
    }
    active.push({ ...player });
  }

  for (const id of staleIds) {
    store.playerIds.delete(id);
    store.players.delete(id);
  }

  active.sort((a, b) => b.score - a.score);
  return active;
}
