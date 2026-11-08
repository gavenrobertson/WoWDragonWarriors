import "server-only";
import type { NextRequest } from "next/server";

/** Cron endpoints accept `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically). */
export function cronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
