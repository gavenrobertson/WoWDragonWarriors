import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KENO_PAYS, MINE_TILES, SCRATCH_FILLER, SCRATCH_PRIZES, SPIRE_FLOORS, SPIRE_MODES, spireMult, type SpireMode, PLINKO_RISKS, PLINKO_ROWS, SLOT_DRAGON_ONE, SLOT_DRAGON_TWO, SLOT_PAIR, SLOT_SYMBOLS, plinkoTable, slotsRtp } from "@/lib/arcade";
import { GAMES } from "@/lib/arcade-games";
import { Plinko } from "@/components/arcade/Plinko";
import { Mines } from "@/components/arcade/Mines";
import { Dragonflight } from "@/components/arcade/Dragonflight";
import { HiLo } from "@/components/arcade/HiLo";
import { Slots } from "@/components/arcade/Slots";
import { Dice } from "@/components/arcade/Dice";
import { CoinFlip } from "@/components/arcade/CoinFlip";
import { Blackjack } from "@/components/arcade/Blackjack";
import { Roulette } from "@/components/arcade/Roulette";
import { Keno } from "@/components/arcade/Keno";
import { Dragonspire } from "@/components/arcade/Dragonspire";
import { Scratch } from "@/components/arcade/Scratch";
import { Leap } from "@/components/arcade/Leap";

type Props = { params: Promise<{ game: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game } = await params;
  const g = GAMES.find((x) => x.slug === game);
  return { title: g ? `${g.name} · Arcade` : "Arcade" };
}

export default async function GamePage({ params }: Props) {
  const { game } = await params;
  const g = GAMES.find((x) => x.slug === game);
  if (!g) notFound();
  const body = (() => {
    switch (game) {
      case "plinko": {
        const tables: Record<string, number[]> = {};
        for (const r of PLINKO_ROWS) for (const k of PLINKO_RISKS) tables[`${r}-${k}`] = plinkoTable(r, k);
        return <Plinko tables={tables} />;
      }
      case "mines": return <Mines tiles={MINE_TILES} />;
      case "dragonflight": return <Dragonflight />;
      case "hilo": return <HiLo />;
      case "slots": return <Slots symbols={SLOT_SYMBOLS.map((s) => ({ id: s.id, icon: s.icon, pay3: s.pay3 }))} pair={SLOT_PAIR} one={SLOT_DRAGON_ONE} two={SLOT_DRAGON_TWO} rtp={slotsRtp()} />;
      case "dice": return <Dice />;
      case "coinflip": return <CoinFlip />;
      case "blackjack": return <Blackjack />;
      case "roulette": return <Roulette />;
      case "keno": return <Keno pays={KENO_PAYS} />;
      case "dragonspire": {
        const mults = Object.fromEntries((Object.keys(SPIRE_MODES) as SpireMode[]).map((m) => [m, Array.from({ length: SPIRE_FLOORS }, (_, i) => spireMult(m, i + 1))])) as Record<SpireMode, number[]>;
        return <Dragonspire modes={SPIRE_MODES} floors={SPIRE_FLOORS} mults={mults} />;
      }
      case "scratch": return <Scratch prizes={SCRATCH_PRIZES.map((p) => ({ id: p.id, icon: p.icon, mult: p.mult }))} filler={{ id: SCRATCH_FILLER.id, icon: SCRATCH_FILLER.icon }} />;
      case "leap": return <Leap />;
    }
  })();
  return (
    <section className="arcade-game" aria-labelledby="game-title">
      <div className="arcade-game-head">
        <h1 id="game-title">{g.name}</h1>
        <span className="soft">{g.blurb}</span>
      </div>
      {body}
    </section>
  );
}
