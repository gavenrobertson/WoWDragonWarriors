"use server";
// Arcade server actions. Every outcome is decided in lib/arcade.ts; these only check who is playing.
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import * as A from "@/lib/arcade";
import { notify, hubUrl } from "@/lib/discord";
import { RARITY_COLOR } from "@/lib/cosmetics";

export type Res<T> = ({ ok: true } & T) | { ok: false; error: string };

async function play<T>(fn: (userId: string) => Promise<T>): Promise<Res<T>> {
  try {
    const v = await getViewer();
    if (v.demo) return { ok: false, error: "The arcade needs the live hub database (demo mode)." };
    if (!v.signedIn || !v.userId) return { ok: false, error: "Sign in with Battle.net to play." };
    return { ok: true, ...(await fn(v.userId)) } as Res<T>;
  } catch (e) {
    if (e instanceof A.ArcadeError) return { ok: false, error: e.message };
    console.error("arcade", e);
    return { ok: false, error: "Something went wrong. Your marks are safe; try again." };
  }
}

export async function spinDaily() { return play((u) => A.spinWheel(u)); }
export async function claimWelcome() { return play((u) => A.claimWelcome(u)); }

export async function plinkoDrop(input: { bet: number; rows: number; risk: A.PlinkoRisk }) {
  return play(async (u) => {
    const bet = A.checkBet(input.bet);
    const r = A.playPlinko(Number(input.rows), input.risk);
    await A.debit(u, bet);
    const won = Math.floor(bet * r.mult);
    const balance = await A.credit(u, won);
    await A.logPlay(u, "plinko", bet, won, { rows: input.rows, risk: input.risk, slot: r.slot, mult: r.mult });
    return { ...r, won, balance };
  });
}

export async function diceRoll(input: { bet: number; target: number; over: boolean }) {
  return play(async (u) => {
    const bet = A.checkBet(input.bet);
    const r = A.playDice(input.target, !!input.over);
    await A.debit(u, bet);
    const won = r.win ? Math.floor(bet * r.mult) : 0;
    const balance = await A.credit(u, won);
    await A.logPlay(u, "dice", bet, won, { target: input.target, over: input.over, roll: r.roll });
    return { ...r, won, balance };
  });
}

export async function coinFlip(input: { bet: number; side: "alliance" | "horde" }) {
  return play(async (u) => {
    const bet = A.checkBet(input.bet);
    const r = A.playCoin(input.side);
    await A.debit(u, bet);
    const won = r.win ? Math.floor(bet * r.mult) : 0;
    const balance = await A.credit(u, won);
    await A.logPlay(u, "coinflip", bet, won, { side: input.side, landed: r.landed });
    return { ...r, won, balance };
  });
}

export async function slotsSpin(input: { bet: number }) {
  return play(async (u) => {
    const bet = A.checkBet(input.bet);
    const r = A.playSlots();
    await A.debit(u, bet);
    const won = Math.floor(bet * r.mult);
    const balance = await A.credit(u, won);
    await A.logPlay(u, "slots", bet, won, { reels: r.reels, mult: r.mult });
    return { ...r, won, balance };
  });
}

export async function minesStart(input: { bet: number; mines: number }) { return play((u) => A.minesStart(u, A.checkBet(input.bet), input.mines)); }
export async function minesReveal(input: { id: string; tile: number }) { return play((u) => A.minesReveal(u, input.id, input.tile)); }
export async function minesCashout(input: { id: string }) { return play((u) => A.minesCashout(u, input.id)); }

export async function hiloStart(input: { bet: number }) { return play((u) => A.hiloStart(u, A.checkBet(input.bet))); }
export async function hiloGuess(input: { id: string; guess: "higher" | "lower" | "skip" }) { return play((u) => A.hiloGuess(u, input.id, input.guess)); }
export async function hiloCashout(input: { id: string }) { return play((u) => A.hiloCashout(u, input.id)); }

export async function crashStart(input: { bet: number; auto: number | null }) { return play((u) => A.crashStart(u, A.checkBet(input.bet), input.auto ? Number(input.auto) : null)); }
export async function crashPoll(input: { id: string }) { return play((u) => A.crashPoll(u, input.id)); }
export async function crashCashout(input: { id: string }) { return play((u) => A.crashCashout(u, input.id)); }

export async function openChest(input: { chest: string }) {
  return play(async (u) => {
    const r = await A.openChest(u, input.chest);
    // Legendary drops are worth a shout in Discord.
    if (r.rarity === "legendary" && !r.duplicate && r.item.kind !== "marks") {
      const v = await getViewer();
      await notify("roster", {
        title: `🐉 Legendary drop: ${r.item.name}`,
        description: `**${v.main?.name ?? "A guildmate"}** opened a chest in the arcade and found **${r.item.name}** (${r.item.blurb.toLowerCase()}).`,
        color: parseInt(RARITY_COLOR.legendary.slice(1), 16), url: hubUrl("/arcade/chests"),
      });
    }
    return r;
  });
}

export async function backContender(input: { itemId: number; characterId: string; stake: number }) {
  const v = await getViewer();
  if (v.perms.canAwardLoot) return { ok: false as const, error: "Council members vote; the observer pool is for everyone else." };
  const r = await play((u) => A.poolStake(u, Math.floor(Number(input.itemId)), String(input.characterId), input.stake));
  if (r.ok) revalidatePath("/loot/council");
  return r;
}

export async function equipCosmetic(input: { kind: "name" | "title" | "theme"; id: string | null }) {
  const r = await play(async (u) => { await A.equip(u, input.kind, input.id); return {}; });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
