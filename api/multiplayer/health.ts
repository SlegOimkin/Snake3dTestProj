import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStorageMode, listActivePlayers } from "./_store";

function getErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const players = await listActivePlayers(Date.now());
    res.status(200).json({
      ok: true,
      storageMode: getStorageMode(),
      playersOnline: players.length
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "health_failed",
      detail: getErrorDetail(error)
    });
  }
}
