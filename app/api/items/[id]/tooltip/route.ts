// Item tooltip for hover cards. Served from the items table (filled from equipped items during profile sync);
// otherwise fetched once from Blizzard (Forever static data, then retail as a fallback) and cached.
import { NextResponse } from "next/server";
import * as bnet from "@/lib/blizzard";
import { configured } from "@/lib/config";
import { d1, json, nowIso, sql, sqlOne } from "@/lib/db";
import { normaliseTip, type ItemTip } from "@/lib/tooltip";

const RETRY_AFTER_MS = 24 * 3600_000; // re-check items Blizzard had nothing for once a day

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Math.floor(Number((await params).id));
  if (!Number.isFinite(id) || id <= 0 || id > 10_000_000) return NextResponse.json({ tip: null }, { status: 400 });
  const ok = (tip: ItemTip | null, maxAge: number) =>
    NextResponse.json({ tip }, { headers: { "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge * 4}` } });

  if (!d1()) return ok(null, 60);
  const row = await sqlOne<{ name: string; quality: string | null; tooltip: string | null; tooltip_at: string | null }>(
    "select name, quality, tooltip, tooltip_at from items where id = $1", [id]);
  const cached = row?.tooltip ? json<ItemTip | null>(row.tooltip, null) : null;
  if (cached?.name) return ok(cached, 3600);
  if (row?.tooltip_at && Date.now() - new Date(row.tooltip_at).getTime() < RETRY_AFTER_MS) {
    return ok(row ? { name: row.name, quality: row.quality ?? "common", stats: [], spells: [] } : null, 600);
  }
  if (!configured.battlenet()) return ok(null, 60);

  let tip: ItemTip | null = null;
  try {
    const forever = await bnet.item(id);
    tip = normaliseTip(forever?.preview_item ?? forever, "forever");
    if (!tip?.stats.length && !tip?.spells.length && !tip?.armor && !tip?.weapon) {
      const retail = await bnet.itemIn(id, bnet.RETAIL_STATIC_NS);
      const rt = normaliseTip(retail?.preview_item, "retail");
      if (rt) tip = { ...rt, name: row?.name ?? rt.name, quality: row?.quality ?? rt.quality };
    }
  } catch { /* Blizzard hiccup: fall through with whatever we have */ }
  if (!tip && row) tip = { name: row.name, quality: row.quality ?? "common", stats: [], spells: [] };
  if (row) await sql("update items set tooltip = $2, tooltip_at = $3 where id = $1", [id, tip && (tip.stats.length || tip.spells.length || tip.armor || tip.weapon) ? JSON.stringify(tip) : null, nowIso()]);
  return ok(tip, 3600);
}
