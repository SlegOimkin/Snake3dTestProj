import type { MultiplayerPlayerState, Vec3 } from "../types";

interface JoinResponse {
  ok: boolean;
  self?: unknown;
  players?: unknown;
  tickRateMs?: number;
  storageMode?: "memory" | "kv" | "redis";
  error?: string;
}

interface SyncResponse {
  ok: boolean;
  players?: unknown;
  now?: number;
  storageMode?: "memory" | "kv" | "redis";
  error?: string;
}

interface JoinResult {
  ok: boolean;
  error?: string;
}

export interface LocalSyncState {
  position: Vec3;
  segments: Vec3[];
  headingRad: number;
  speed: number;
  length: number;
  score: number;
  alive: boolean;
}

function sanitizeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_ .-]/gu, "")
    .trim()
    .slice(0, 16);
}

const PLAYER_ID_KEY = "snake3d:playerId";

function isValidId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function createPlayerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`.slice(0, 32);
}

function getPersistedPlayerId(): string {
  try {
    const raw = localStorage.getItem(PLAYER_ID_KEY) ?? "";
    if (isValidId(raw)) {
      return raw;
    }
  } catch {
    // ignore storage failures (private mode/restricted env)
  }

  const next = createPlayerId();
  try {
    localStorage.setItem(PLAYER_ID_KEY, next);
  } catch {
    // ignore storage failures
  }
  return next;
}

function isLocalRuntime(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `local-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `local-${Math.random().toString(36).slice(2, 10)}`;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toVec3(value: unknown, fallback: Vec3): Vec3 {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }
  const record = value as Record<string, unknown>;
  return {
    x: asNumber(record.x, fallback.x),
    y: asNumber(record.y, fallback.y),
    z: asNumber(record.z, fallback.z)
  };
}

function normalizePlayer(value: unknown): MultiplayerPlayerState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== "string" || !isValidId(id)) {
    return null;
  }

  const segmentsInput = Array.isArray(record.segments) ? record.segments : [];
  const segments: Vec3[] = [];
  for (const segment of segmentsInput) {
    if (!segment || typeof segment !== "object") {
      continue;
    }
    const next = toVec3(segment, { x: 0, y: 0.7, z: 0 });
    segments.push(next);
    if (segments.length >= 96) {
      break;
    }
  }

  const nameRaw = typeof record.name === "string" ? record.name : "";
  const name = sanitizeName(nameRaw) || "Player";
  const lengthFallback = Math.max(1, segments.length + 1);
  const color =
    typeof record.color === "string" && record.color.trim().length > 0 ? record.color : "#73ffe2";

  return {
    id,
    name,
    color,
    position: toVec3(record.position, { x: 0, y: 0.7, z: 0 }),
    segments,
    headingRad: asNumber(record.headingRad, 0),
    speed: asNumber(record.speed, 0),
    length: Math.max(1, Math.round(asNumber(record.length, lengthFallback))),
    score: Math.max(0, Math.round(asNumber(record.score, 0))),
    alive: Boolean(record.alive),
    updatedAt: Math.max(0, Math.round(asNumber(record.updatedAt, Date.now())))
  };
}

function normalizePlayers(value: unknown, selfId: string | null): MultiplayerPlayerState[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, MultiplayerPlayerState>();
  for (const item of value) {
    const player = normalizePlayer(item);
    if (!player) {
      continue;
    }
    if (selfId && player.id === selfId) {
      continue;
    }
    const previous = deduped.get(player.id);
    if (!previous || player.updatedAt >= previous.updatedAt) {
      deduped.set(player.id, player);
    }
  }

  return Array.from(deduped.values()).sort((a, b) =>
    a.score !== b.score ? b.score - a.score : b.updatedAt - a.updatedAt
  );
}

export class MultiplayerClient {
  private persistentPlayerId = getPersistedPlayerId();
  private selfId: string | null = null;
  private selfName = "";
  private offlineMode = false;
  private syncAccumulatorSec = 0;
  private syncIntervalMs = 120;
  private inFlight = false;
  private lastError = "";
  private latencyMs = 0;
  private remotePlayers: MultiplayerPlayerState[] = [];

  get connected(): boolean {
    return this.selfId !== null;
  }

  get offline(): boolean {
    return this.offlineMode;
  }

  get playerName(): string {
    return this.selfName;
  }

  get error(): string {
    return this.lastError;
  }

  get latency(): number {
    return this.latencyMs;
  }

  getRemotes(): MultiplayerPlayerState[] {
    return this.remotePlayers;
  }

  async join(name: string): Promise<JoinResult> {
    const normalizedName = sanitizeName(name);
    if (!normalizedName) {
      return { ok: false, error: "name_required" };
    }

    const start = performance.now();
    const response = await this.safeFetch<JoinResponse>("/api/multiplayer/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: this.persistentPlayerId,
        name: normalizedName
      })
    });
    this.latencyMs = Math.round(performance.now() - start);

    const self = normalizePlayer(response.data?.self);
    if (!response.ok || !response.data?.ok || !self) {
      const reason = response.data?.error || response.error || "join_failed";
      if ((reason === "network_unreachable" || reason === "http_404") && isLocalRuntime()) {
        this.selfId = `local-${this.persistentPlayerId.slice(0, 12) || createLocalId()}`;
        this.selfName = normalizedName;
        this.offlineMode = true;
        this.remotePlayers = [];
        this.lastError = "";
        this.syncAccumulatorSec = 0;
        this.latencyMs = 0;
        return { ok: true };
      }
      this.offlineMode = false;
      this.remotePlayers = [];
      this.lastError = reason;
      return { ok: false, error: reason };
    }

    this.selfId = self.id;
    if (isValidId(self.id) && self.id !== this.persistentPlayerId) {
      this.persistentPlayerId = self.id;
      try {
        localStorage.setItem(PLAYER_ID_KEY, this.persistentPlayerId);
      } catch {
        // ignore storage failures
      }
    }
    this.selfName = normalizedName;
    this.offlineMode = false;
    this.syncIntervalMs = Math.max(70, Math.min(300, response.data.tickRateMs ?? 120));
    this.remotePlayers = normalizePlayers(response.data.players, this.selfId);
    this.lastError = "";
    this.syncAccumulatorSec = 0;
    return { ok: true };
  }

  async leave(): Promise<void> {
    if (!this.selfId) {
      this.remotePlayers = [];
      this.offlineMode = false;
      return;
    }
    const id = this.selfId;
    this.selfId = null;
    this.selfName = "";
    this.offlineMode = false;
    this.remotePlayers = [];
    this.syncAccumulatorSec = 0;
    this.inFlight = false;
    void this.safeFetch("/api/multiplayer/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
  }

  tick(dt: number, state: LocalSyncState): void {
    if (!this.selfId) {
      return;
    }
    if (this.offlineMode) {
      return;
    }
    this.syncAccumulatorSec += dt;
    if (this.inFlight) {
      return;
    }
    if (this.syncAccumulatorSec * 1000 < this.syncIntervalMs) {
      return;
    }
    this.syncAccumulatorSec = 0;
    this.inFlight = true;
    void this.sync(state).finally(() => {
      this.inFlight = false;
    });
  }

  private async sync(state: LocalSyncState): Promise<void> {
    if (!this.selfId) {
      return;
    }
    if (this.offlineMode) {
      return;
    }

    const payload = {
      id: this.selfId,
      name: this.selfName,
      state: {
        position: state.position,
        segments: state.segments,
        headingRad: state.headingRad,
        speed: state.speed,
        length: state.length,
        score: state.score,
        alive: state.alive
      }
    };

    const start = performance.now();
    const response = await this.safeFetch<SyncResponse>("/api/multiplayer/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    this.latencyMs = Math.round(performance.now() - start);

    if (!response.ok || !response.data?.ok) {
      const reason = response.data?.error || response.error || "sync_failed";
      if (reason === "unknown_player" && this.selfName) {
        this.selfId = null;
        this.remotePlayers = [];
        const retry = await this.join(this.selfName);
        this.lastError = retry.ok ? "" : retry.error ?? reason;
        return;
      }
      this.lastError = reason;
      return;
    }
    this.remotePlayers = normalizePlayers(response.data.players, this.selfId);
    this.lastError = "";
  }

  private async safeFetch<T>(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<{ ok: boolean; data?: T; error?: string }> {
    try {
      const res = await fetch(input, init);
      const data = (await res.json().catch(() => undefined)) as T | undefined;
      if (!res.ok) {
        return { ok: false, data, error: `http_${res.status}` };
      }
      return { ok: true, data };
    } catch {
      return { ok: false, error: "network_unreachable" };
    }
  }
}
