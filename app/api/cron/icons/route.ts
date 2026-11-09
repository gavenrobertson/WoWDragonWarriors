import { NextResponse, type NextRequest } from "next/server";
import { configured } from "@/lib/config";
import { cronAuthorized } from "@/lib/cron";
import { syncItemIcons } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every 15 min: cache item icons for newly seen items (batched, backs off on 429). */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!configured.db() || !configured.battlenet()) return NextResponse.json({ skipped: "database or Battle.net keys not configured" });
  try {
    return NextResponse.json(await syncItemIcons());
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
