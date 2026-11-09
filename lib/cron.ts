import "server-only";
import type { NextRequest } from "next/server";

/** Cron endpoints accept `Authorization: Bearer $CRON_SECRET` (the Cron Trigger in custom-worker.ts sends it). */
export function cronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
