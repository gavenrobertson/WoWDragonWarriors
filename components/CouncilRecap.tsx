// Council session recap: every item the council handed out, who got it, and how. Used by the public
// overview page and at the end of a practice session.
import Link from "next/link";
import { Avatar, ItemIcon } from "@/components/bits";
import { PlayerName } from "@/components/PlayerName";
import { qualityColor } from "@/lib/ui";

export interface RecapItem {
  id: number; name: string; quality: string; iconUrl: string | null;
  winner: { name: string; className: string; avatarUrl: string | null; nameStyle?: string | null; slug?: string | null };
  overruled: boolean; detail: string; by?: string | null; pot?: number; called?: number;
}
export interface RecapData {
  date: string; remaining: number; items: RecapItem[];
  pool?: { pot: number; observers: number; best: { name: string; className: string; nameStyle?: string | null; profit: number } | null };
}

export function CouncilRecap({ data, practice }: { data: RecapData; practice?: boolean }) {
  const overruled = data.items.filter((i) => i.overruled).length;
  const people = new Set(data.items.map((i) => i.winner.name)).size;
  return (
    <div className="recap">
      <div className="recap-head">
        <span className="eyebrow">{practice ? "Practice session" : data.remaining ? "Council in session" : "Council adjourned"} · {data.date}</span>
        <h2>{data.remaining ? "The council so far" : "The council has spoken"}</h2>
        {data.remaining > 0 && <p className="small soft">{data.remaining} item{data.remaining === 1 ? "" : "s"} still before the council.</p>}
      </div>
      <div className="recap-stats">
        <div><strong>{data.items.length}</strong><span>items awarded</span></div>
        <div><strong>{people}</strong><span>raiders geared</span></div>
        <div><strong>{overruled}</strong><span>overruled</span></div>
        {data.pool && data.pool.observers > 0 && <div><strong className="gold">{data.pool.pot.toLocaleString("en-US")}</strong><span>marks in observer pools</span></div>}
      </div>
      {data.pool?.best && (
        <p className="recap-best">🏆 Sharpest observer: <PlayerName name={data.pool.best.name} className={data.pool.best.className} nameStyle={data.pool.best.nameStyle} showTitle={false} /> called it for <strong className="gold">+{data.pool.best.profit.toLocaleString("en-US")}</strong> marks</p>
      )}
      <ol className="recap-list">
        {data.items.map((it, i) => (
          <li key={`${it.id}-${i}`} style={{ ["--i" as string]: i }}>
            <ItemIcon slot="" quality={it.quality} iconUrl={it.iconUrl} itemId={it.id} />
            <span className="recap-item"><strong style={{ color: qualityColor(it.quality) }}>{it.name}</strong>
              <span className={`recap-how${it.overruled ? " over" : ""}`}>{it.overruled ? "⚖ Overruled" : "Council"} · {it.detail}{it.by ? ` · by ${it.by}` : ""}</span></span>
            <span className="recap-winner">
              <Avatar name={it.winner.name} className={it.winner.className} size={32} url={it.winner.avatarUrl} />
              {it.winner.slug ? <Link href={`/characters/${it.winner.slug}`}><PlayerName name={it.winner.name} className={it.winner.className} nameStyle={it.winner.nameStyle} showTitle={false} /></Link>
                : <PlayerName name={it.winner.name} className={it.winner.className} nameStyle={it.winner.nameStyle} showTitle={false} />}
            </span>
            {!!it.pot && <span className="recap-pot micro"><span className="mark-coin sm" aria-hidden="true" /> {it.pot.toLocaleString("en-US")} · {it.called ? `${it.called} called it` : "refunded"}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
