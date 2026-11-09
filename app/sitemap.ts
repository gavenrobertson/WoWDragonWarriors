import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/guild", "/raids", "/loot", "/bis", "/roster", "/apply", "/sign-in", "/data-sources", "/brand"].map((p) => ({ url: `${SITE.url}${p === "/" ? "" : p}` }));
}
