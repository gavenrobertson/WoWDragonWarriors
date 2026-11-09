// A gold-framed playing card used by Higher or Lower and Blackjack.
const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];

export function PlayingCard({ rank, suit, flip, small, back }: { rank: number; suit?: number; flip?: number; small?: boolean; back?: boolean }) {
  if (back) return <div className={`hl-card back${small ? " small" : ""}`} aria-label="Face-down card" />;
  const s = SUITS[suit ?? (rank * 7 + (flip ?? 0)) % 4], red = s === "♥" || s === "♦";
  return (
    <div key={flip} className={`hl-card${small ? " small" : ""}${red ? " red" : ""}`} aria-label={`${RANK[rank]} of ${s}`}>
      <span className="hl-corner">{RANK[rank]}<br />{s}</span>
      <span className="hl-center">{RANK[rank]}</span>
      <span className="hl-corner br">{RANK[rank]}<br />{s}</span>
    </div>
  );
}
export const rankLabel = (r: number) => RANK[r];
