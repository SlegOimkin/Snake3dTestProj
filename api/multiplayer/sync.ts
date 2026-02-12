import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  asNumber,
  getStorageMode,
  getPlayer,
  listActivePlayers,
  sanitizeName,
  upsertPlayer,
  type StoredPlayerState
} from "./_store.js";

function sendMethodNotAllowed(res: VercelResponse): void {
  res.setHeader("Allow", "POST");
  res.status(405).json({ ok: false, error: "method_not_allowed" });
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 64;
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
    if (!existing) {
      res.status(404).json({ ok: false, error: "unknown_player" });
      return;
    }
    const player: StoredPlayerState = {
      id,
      name,
      color: existing.color,
      position: {
        x: asNumber(rawPosition.x, existing.position.x),
        y: asNumber(rawPosition.y, existing.position.y),
        z: asNumber(rawPosition.z, existing.position.z)
      },
      headingRad: asNumber(rawState.headingRad, existing.headingRad),
      speed: asNumber(rawState.speed, existing.speed),
      length: Math.max(1, Math.round(asNumber(rawState.length, existing.length))),
      score: Math.max(0, Math.round(asNumber(rawState.score, existing.score))),
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
