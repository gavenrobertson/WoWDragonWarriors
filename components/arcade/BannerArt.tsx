// A profile banner's artwork. Sits behind the content of a .panel-royal (or .banner-host) frame.
// The inner <i> is an extra layer some banners animate (grids, embers, stars).
import { bannerClass } from "@/lib/cosmetics";

export function BannerArt({ id }: { id: string | null | undefined }) {
  const cls = bannerClass(id);
  if (!cls) return null;
  return <span className={cls} aria-hidden="true"><i /></span>;
}
