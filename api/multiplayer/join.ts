import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import {
  getPlayer,
  getStorageMode,
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
  const name = sanitizeName((body as Record<string, unknown>).name);
  if (!name) {
    res.status(400).json({ ok: false, error: "name_required" });
    return;
  }

  const requestedId = (body as Record<string, unknown>).id;
  const id = isValidId(requestedId) ? requestedId : randomUUID().replace(/-/g, "");
  const now = Date.now();

  try {
    const existing = await getPlayer(id);
    const player: StoredPlayerState = {
      id,
      name,
      color: existing?.color ?? pickColor(id),
      position: existing?.position ?? { x: 0, y: 0.7, z: 0 },
      segments: existing?.segments ?? [],
      headingRad: existing?.headingRad ?? 0,
      speed: existing?.speed ?? 0,
      length: existing?.length ?? 9,
      score: existing?.score ?? 0,
      alive: existing?.alive ?? false,
      updatedAt: now
    };
    await upsertPlayer(player);
    const players = await listActivePlayers(now);
    res.status(200).json({
      ok: true,
      self: player,
      players,
      tickRateMs: 120,
      storageMode: getStorageMode()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "join_failed",
      detail: process.env.NODE_ENV === "production" ? undefined : getErrorDetail(error)
    });
  }
}
