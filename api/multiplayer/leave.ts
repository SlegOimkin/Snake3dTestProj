import type { VercelRequest, VercelResponse } from "@vercel/node";
import { removePlayer } from "./_store";

function sendMethodNotAllowed(res: VercelResponse): void {
  res.setHeader("Allow", "POST");
  res.status(405).json({ ok: false, error: "method_not_allowed" });
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 64;
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
  if (!isValidId(id)) {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    await removePlayer(id);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "leave_failed" });
  }
}
