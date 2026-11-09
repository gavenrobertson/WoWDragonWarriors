// A player's name with their arcade cosmetics: name style (colour, gradient, glow, chrome) and title.
import { cosmeticById, nameClass } from "@/lib/cosmetics";
import { classColor } from "@/lib/ui";

export function PlayerName({ name, className, nameStyle, title, showTitle = true, as: Tag = "span", style }: {
  name: string; className?: string | null; nameStyle?: string | null; title?: string | null; showTitle?: boolean;
  as?: "span" | "strong"; style?: React.CSSProperties;
}) {
  const t = showTitle ? cosmeticById(title)?.name : undefined;
  return (
    <Tag className="player-name" style={style}>
      <span className={nameClass(nameStyle)} style={{ color: classColor(className) }} data-text={name}>{name}</span>
      {t && <span className="player-title"> {t}</span>}
    </Tag>
  );
}
