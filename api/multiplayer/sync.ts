import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  asNumber,
  getStorageMode,
  getPlayer,
  listActivePlayers,
  pickColor,
  sanitizeName,
  upsertPlayer,
  type StoredPlayerState
} from "./_store.js";

function sendMethodNotAllowed(res: VercelResponse): void {
  res.setHeader("Allow", "POST");
  res.status(405).json({ ok: false, error: "method_not_allowed" });
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

function sanitizeSegments(input: unknown, fallback: Vec3Like[]): Vec3Like[] {
  if (!Array.isArray(input)) {
    return fallback;
  }
  if (input.length === 0) {
    return [];
  }
  const cleaned: Vec3Like[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const x = asNumber(record.x, Number.NaN);
    const y = asNumber(record.y, Number.NaN);
    const z = asNumber(record.z, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    cleaned.push({ x, y, z });
    if (cleaned.length >= 96) {
      break;
    }
  }
  return cleaned;
}

function getErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    sendMethodNotAllowed(res);
    return;
  }

  let body: Record<string, unknown>;
  try {
    body =
      typeof req.body === "string"
        ? (JSON.parse(req.body || "{}") as Record<string, unknown>)
        : ((req.body as Record<string, unknown>) ?? {});
  } catch {
    res.status(400).json({ ok: false, error: "invalid_json" });
    return;
  }

  const id = body.id;
  const rawName = body.name;
  const rawState = (body.state as Record<string, unknown> | undefined) ?? {};
  const rawPosition = (rawState.position as Record<string, unknown> | undefined) ?? {};
  const rawSegments = rawState.segments;
  if (!isValidId(id)) {
    res.status(400).json({ ok: false, error: "invalid_id" });
    return;
  }

  const name = sanitizeName(rawName);
  if (!name) {
    res.status(400).json({ ok: false, error: "name_required" });
    return;
  }

  try {
    const now = Date.now();
    const existing = await getPlayer(id);
    const baseline: StoredPlayerState =
      existing ??
      ({
        id,
        name,
        color: pickColor(id),
        position: { x: 0, y: 0.7, z: 0 },
        segments: [],
        headingRad: 0,
        speed: 0,
        length: 9,
        score: 0,
        alive: false,
        updatedAt: now
      } satisfies StoredPlayerState);
    const player: StoredPlayerState = {
      id,
      name,
      color: baseline.color,
      position: {
        x: asNumber(rawPosition.x, baseline.position.x),
        y: asNumber(rawPosition.y, baseline.position.y),
        z: asNumber(rawPosition.z, baseline.position.z)
      },
      segments: sanitizeSegments(rawSegments, baseline.segments),
      headingRad: asNumber(rawState.headingRad, baseline.headingRad),
      speed: asNumber(rawState.speed, baseline.speed),
      length: Math.max(1, Math.round(asNumber(rawState.length, baseline.length))),
      score: Math.max(0, Math.round(asNumber(rawState.score, baseline.score))),
      alive: Boolean(rawState.alive),
      updatedAt: now
    };

    await upsertPlayer(player);
    const players = await listActivePlayers(now);
    res.status(200).json({
      ok: true,
      now,
      players,
      storageMode: getStorageMode()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "sync_failed",
      detail: process.env.NODE_ENV === "production" ? undefined : getErrorDetail(error)
    });
  }
}
