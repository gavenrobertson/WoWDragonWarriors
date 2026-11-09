// Small visual for a cosmetic: a name sample, a title, a theme swatch or a marks pouch.
import { RARITY_COLOR, nameClass, themeAttr, type Cosmetic } from "@/lib/cosmetics";
import { wowIconUrl } from "./ArcadeShell";

export function CosmeticPreview({ c, sample = "Dragon" }: { c: Cosmetic; sample?: string }) {
  if (c.kind === "marks") return <span className="cp cp-marks"><img src={wowIconUrl("inv_misc_coin_02")} alt="" /><strong>+{c.marks}</strong></span>;
  if (c.kind === "name") return <span className="cp cp-name"><span className={nameClass(c.id)} style={{ color: "#fff" }} data-text={sample}>{sample}</span></span>;
  if (c.kind === "title") return <span className="cp cp-title" style={{ color: RARITY_COLOR[c.rarity] }}>&lsaquo;{c.name}&rsaquo;</span>;
  return <span className={`cp cp-theme theme-swatch-${themeAttr(c.id)}`} aria-hidden="true" />;
}
