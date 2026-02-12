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

interface KvClient {
  set: (key: string, value: unknown, options?: { ex?: number }) => Promise<unknown>;
  sadd: (key: string, value: string) => Promise<unknown>;
  srem: (key: string, value: string) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  get: (key: string) => Promise<unknown>;
  smembers: (key: string) => Promise<unknown>;
}

interface RedisUrlClient {
  connect: () => Promise<void>;
  set: (key: string, value: string, options?: { EX?: number }) => Promise<unknown>;
  sAdd: (key: string, value: string) => Promise<unknown>;
  sRem: (key: string, value: string) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  sMembers: (key: string) => Promise<string[]>;
}

declare global {
  // eslint-disable-next-line no-var
  var __snake3dMpMemory: MemoryStore | undefined;
}

let forcedMemoryMode = false;
let kvClientPromise: Promise<KvClient | null> | null = null;

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

function isRedisUrlConfigured(): boolean {
  return Boolean(process.env.KV_REDIS_URL);
}

export function isRemoteStorageConfigured(): boolean {
  return isKvConfigured() || isRedisUrlConfigured();
}

async function getKvClient(): Promise<KvClient | null> {
  if (forcedMemoryMode || !isRemoteStorageConfigured()) {
    return null;
  }
  if (!kvClientPromise) {
    if (isKvConfigured()) {
      kvClientPromise = import("@vercel/kv")
        .then((module) => module.kv as KvClient)
        .catch((error) => {
          forcedMemoryMode = true;
          console.warn("[snake3d-mp] Failed to load @vercel/kv, switched to memory mode", error);
          return null;
        });
    } else {
      kvClientPromise = import("redis")
        .then(async (module) => {
          const redisUrl = process.env.KV_REDIS_URL;
          if (!redisUrl) {
            return null;
          }
          const raw = module.createClient({ url: redisUrl }) as unknown as RedisUrlClient;
          await raw.connect();
          const wrapped: KvClient = {
            set: async (key, value, options) => {
              await raw.set(key, JSON.stringify(value), options?.ex ? { EX: options.ex } : undefined);
              return "OK";
            },
            sadd: async (key, value) => raw.sAdd(key, value),
            srem: async (key, value) => raw.sRem(key, value),
            del: async (key) => raw.del(key),
            get: async (key) => {
              const rawValue = await raw.get(key);
              if (rawValue === null) {
                return null;
              }
              try {
                return JSON.parse(rawValue) as unknown;
              } catch {
                return rawValue;
              }
            },
            smembers: async (key) => raw.sMembers(key)
          };
          return wrapped;
        })
        .catch((error) => {
          forcedMemoryMode = true;
          console.warn("[snake3d-mp] Failed to connect with KV_REDIS_URL, switched to memory mode", error);
          return null;
        });
    }
  }
  return kvClientPromise;
}

async function runWithFallback<T>(
  operation: string,
  kvOp: (kvClient: KvClient) => Promise<T>,
  memoryOp: () => T | Promise<T>
): Promise<T> {
  const kvClient = await getKvClient();
  if (kvClient) {
    try {
      return await kvOp(kvClient);
    } catch (error) {
      forcedMemoryMode = true;
      // Keep runtime usable even when KV is misconfigured/unavailable.
      console.warn(`[snake3d-mp] KV operation failed (${operation}), switched to memory mode`, error);
    }
  }
  return await memoryOp();
}

export function getStorageMode(): "kv" | "redis" | "memory" {
  if (forcedMemoryMode) {
    return "memory";
  }
  if (isKvConfigured()) {
    return "kv";
  }
  if (isRedisUrlConfigured()) {
    return "redis";
  }
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
  await runWithFallback(
    "upsertPlayer",
    async (kvClient) => {
      await kvClient.set(playerKey(player.id), player, { ex: PLAYER_TTL_SEC });
      await kvClient.sadd(PLAYER_IDS_KEY, player.id);
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
    async (kvClient) => {
      await kvClient.srem(PLAYER_IDS_KEY, id);
      await kvClient.del(playerKey(id));
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
    async (kvClient) => {
      const value = await kvClient.get(playerKey(id));
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
    async (kvClient) => {
      const idsRaw = await kvClient.smembers(PLAYER_IDS_KEY);
      const ids = (idsRaw as string[] | null) ?? [];
      if (ids.length === 0) {
        return [];
      }

      const results = await Promise.all(
        ids.map(async (id) => {
          const player = await kvClient.get(playerKey(id));
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
            await kvClient.srem(PLAYER_IDS_KEY, id);
            await kvClient.del(playerKey(id));
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
