// Guild crest inside two counter-rotating rune rings, with a breathing glow.
const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ ✦ ";

export function Medallion({ size = 132 }: { size?: number }) {
  return (
    <div className="medallion" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="medallion-ring">
        <defs><path id="medRing" d="M100,100 m-86,0 a86,86 0 1,1 172,0 a86,86 0 1,1 -172,0" /></defs>
        <circle cx="100" cy="100" r="96" fill="none" stroke="#C9A13B" strokeOpacity=".6" strokeWidth="1.5" />
        <text fill="#F5D77E" fillOpacity=".8" fontSize="12.5" letterSpacing="2.4"><textPath href="#medRing">{RUNES + RUNES}</textPath></text>
      </svg>
      <svg viewBox="0 0 200 200" className="medallion-ring reverse">
        <circle cx="100" cy="100" r="74" fill="none" stroke="#9B5DFF" strokeOpacity=".55" strokeWidth="1.5" strokeDasharray="2 7" />
      </svg>
      <img src="/assets/crest-256.png" alt="" className="medallion-crest" />
    </div>
  );
}
