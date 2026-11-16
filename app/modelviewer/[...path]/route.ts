import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Same-origin relay for Wowhead's 3D model viewer files (wow.zamimg.com/modelviewer/live/...).
 * Wowhead's CDN doesn't send CORS headers, so the viewer can't fetch models cross-origin.
 * Only the modelviewer/live tree is relayed (meta files fall back to the Classic set), cached at Cloudflare's edge for a week.
 */
const SAFE = /^live\/[A-Za-z0-9_\-./]+$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const rel = path.join("/");
  if (!SAFE.test(rel) || rel.includes("..")) return new Response("Not found", { status: 404 });
  const init = {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DragonWarriorsHub/1.0)", Referer: "https://www.wowhead.com/" },
    // Cloudflare edge cache (ignored outside Workers).
    cf: { cacheEverything: true, cacheTtl: 604800 },
  } as RequestInit;
  let res = await fetch(`https://wow.zamimg.com/modelviewer/${rel}${req.nextUrl.search}`, init);
  // Many Classic-era item displays (old guns, wands, thrown weapons, some armor) are only in Wowhead's Classic
  // data set. Their model and texture files are in the live set, so only the meta file needs the fallback.
  if (res.status === 404 && rel.startsWith("live/meta/")) {
    res = await fetch(`https://wow.zamimg.com/modelviewer/classic/${rel.slice(5)}${req.nextUrl.search}`, init);
  }
  if (!res.ok) return new Response(null, { status: res.status === 403 ? 404 : res.status });
  const headers = new Headers();
  for (const h of ["content-type", "content-length", "etag", "last-modified"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "public, max-age=604800, immutable");
  return new Response(res.body, { status: 200, headers });
}
