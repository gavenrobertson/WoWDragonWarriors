import { NextResponse, type NextRequest } from "next/server";
import { configured, isDemo } from "@/lib/config";
import { sqlOne } from "@/lib/db";
import { modelConfig } from "@/lib/models";

export const dynamic = "force-dynamic";

/** 3D model config for a guild character (public, like the character page). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (isDemo() || !configured.battlenet()) return NextResponse.json({ model: null, reason: "3D models need the Battle.net API." });
  // Only characters the hub knows about, so this can't be used to query arbitrary characters.
  const known = await sqlOne("select 1 from characters where slug = $1", [slug]);
  if (!known) return NextResponse.json({ model: null, reason: "Unknown character." }, { status: 404 });
  try {
    const model = await modelConfig(slug);
    if (model && !model.supported) {
      return NextResponse.json({ model: null, reason: `${model.raceName ?? "This race"} isn't in the 3D viewer yet` }, { headers: { "cache-control": "private, max-age=300" } });
    }
    if (!model) return NextResponse.json({ model: null, reason: "Not in Blizzard's API yet (characters appear after level 10)" });
    return NextResponse.json({ model }, { headers: { "cache-control": "private, max-age=300" } });
  } catch (e) {
    console.error("model config", e);
    return NextResponse.json({ model: null, reason: "Blizzard didn't respond." }, { status: 502 });
  }
}
