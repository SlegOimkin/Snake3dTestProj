import { kv } from "@vercel/kv";

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

const PLAYER_IDS_KEY = "snake3d:mp:player_ids";
const PLAYER_KEY_PREFIX = "snake3d:mp:player:";
const PLAYER_TTL_SEC = 30;
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

interface MemoryStore {
  playerIds: Set<string>;
  players: Map<string, StoredPlayerState>;
}

declare global {
  // eslint-disable-next-line no-var
  var __snake3dMpMemory: MemoryStore | undefined;
}

let forcedMemoryMode = false;

function playerKey(id: string): string {
  return `${PLAYER_KEY_PREFIX}${id}`;
}

function getMemoryStore(): MemoryStore {
  if (!globalThis.__snake3dMpMemory) {
    globalThis.__snake3dMpMemory = {
      playerIds: new Set<string>(),
      players: new Map<string, StoredPlayerState>()
    };
  }
  return globalThis.__snake3dMpMemory;
}

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function runWithFallback<T>(operation: string, kvOp: () => Promise<T>, memoryOp: () => T | Promise<T>): Promise<T> {
  if (!forcedMemoryMode && isKvConfigured()) {
    try {
      return await kvOp();
    } catch (error) {
      forcedMemoryMode = true;
      // Keep runtime usable even when KV is misconfigured/unavailable.
      console.warn(`[snake3d-mp] KV operation failed (${operation}), switched to memory mode`, error);
    }
  }
  return await memoryOp();
}

export function getStorageMode(): "kv" | "memory" {
  return !forcedMemoryMode && isKvConfigured() ? "kv" : "memory";
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
  await runWithFallback(
    "upsertPlayer",
    async () => {
      await kv.set(playerKey(player.id), player, { ex: PLAYER_TTL_SEC });
      await kv.sadd(PLAYER_IDS_KEY, player.id);
    },
    async () => {
      const store = getMemoryStore();
      store.playerIds.add(player.id);
      store.players.set(player.id, { ...player });
    }
  );
}

export async function removePlayer(id: string): Promise<void> {
  await runWithFallback(
    "removePlayer",
    async () => {
      await kv.srem(PLAYER_IDS_KEY, id);
      await kv.del(playerKey(id));
    },
    async () => {
      const store = getMemoryStore();
      store.playerIds.delete(id);
      store.players.delete(id);
    }
  );
}

export async function getPlayer(id: string): Promise<StoredPlayerState | null> {
  return runWithFallback(
    "getPlayer",
    async () => {
      const value = await kv.get(playerKey(id));
      return (value as StoredPlayerState | null) ?? null;
    },
    async () => {
      const value = getMemoryStore().players.get(id);
      return value ? { ...value } : null;
    }
  );
}

export async function listActivePlayers(nowMs: number): Promise<StoredPlayerState[]> {
  return runWithFallback(
    "listActivePlayers",
    async () => {
      const idsRaw = await kv.smembers(PLAYER_IDS_KEY);
      const ids = (idsRaw as string[] | null) ?? [];
      if (ids.length === 0) {
        return [];
      }

      const results = await Promise.all(
        ids.map(async (id) => {
          const player = await kv.get(playerKey(id));
          return {
            id,
            player: (player as StoredPlayerState | null) ?? null
          };
        })
      );

      const active: StoredPlayerState[] = [];
      const staleIds: string[] = [];

      for (const item of results) {
        if (!item.player) {
          staleIds.push(item.id);
          continue;
        }
        if (nowMs - item.player.updatedAt > STALE_MS) {
          staleIds.push(item.id);
          continue;
        }
        active.push(item.player);
      }

      if (staleIds.length > 0) {
        await Promise.all(
          staleIds.map(async (id) => {
            await kv.srem(PLAYER_IDS_KEY, id);
            await kv.del(playerKey(id));
          })
        );
      }

      active.sort((a, b) => b.score - a.score);
      return active;
    },
    async () => {
      const store = getMemoryStore();
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
  );
}
