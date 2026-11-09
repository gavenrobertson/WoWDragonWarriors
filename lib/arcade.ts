import "server-only";
// Arcade engine: Dragon Marks wallet and every game's outcome, decided here on the server
// (the browser only animates the result). Marks are play money: they buy cosmetics, never anything real.
import { sql, sqlOne, tx } from "./db";
import { CHESTS, COSMETICS, DUPLICATE_REFUND, rollChest, type Cosmetic } from "./cosmetics";

export const START_MARKS = 0; // new players claim the welcome bonus instead
export const WELCOME_MARKS = 2500;
export const MIN_BET = 10;
export const MAX_BET = 25_000;
const EDGE = 0.97; // return to player on fair-priced games

export class ArcadeError extends Error {}

/** Uniform float in [0, 1) from the platform CSPRNG. */
export function rand() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0] * 2 ** 21 + (a[1] >>> 11)) / 2 ** 53;
}
const randInt = (n: number) => Math.floor(rand() * n);

// ---------------------------------------------------------------- wallet
export interface Wallet { marks: number; streak: number; lastDaily: string | null; lifetimeWon: number; lifetimeWagered: number; welcomed: boolean }

export async function wallet(userId: string): Promise<Wallet> {
  await sql("insert into arcade_wallets (user_id, marks) values ($1, $2) on conflict (user_id) do nothing", [userId, START_MARKS]);
  const w = await sqlOne<any>("select marks, daily_streak, last_daily, lifetime_won, lifetime_wagered, welcomed from arcade_wallets where user_id = $1", [userId]);
  return { marks: w?.marks ?? 0, streak: w?.daily_streak ?? 0, lastDaily: w?.last_daily ?? null, lifetimeWon: w?.lifetime_won ?? 0, lifetimeWagered: w?.lifetime_wagered ?? 0, welcomed: !!w?.welcomed };
}

export function checkBet(bet: unknown) {
  const b = Math.floor(Number(bet));
  if (!Number.isFinite(b) || b < MIN_BET) throw new ArcadeError(`Minimum bet is ${MIN_BET} marks.`);
  if (b > MAX_BET) throw new ArcadeError(`Maximum bet is ${MAX_BET.toLocaleString("en-US")} marks.`);
  return b;
}

/** Take marks atomically; fails if the balance is too low. */
export async function debit(userId: string, amount: number, wager = true) {
  await wallet(userId);
  const r = await sqlOne<{ marks: number }>(
    `update arcade_wallets set marks = marks - $2, lifetime_wagered = lifetime_wagered + $3 where user_id = $1 and marks >= $2 returning marks`,
    [userId, amount, wager ? amount : 0],
  );
  if (!r) throw new ArcadeError("Not enough Dragon Marks. Spin the daily wheel for more.");
  return r.marks;
}
export async function credit(userId: string, amount: number) {
  if (amount <= 0) return (await wallet(userId)).marks;
  const r = await sqlOne<{ marks: number }>(
    "update arcade_wallets set marks = marks + $2, lifetime_won = lifetime_won + $2 where user_id = $1 returning marks", [userId, Math.floor(amount)]);
  return r?.marks ?? 0;
}
export async function logPlay(userId: string, game: string, bet: number, payout: number, detail?: unknown) {
  await sql("insert into arcade_plays (user_id, game, bet, payout, detail) values ($1,$2,$3,$4,$5)", [userId, game, bet, Math.floor(payout), detail ? JSON.stringify(detail) : null]);
}
const pay = (bet: number, mult: number) => Math.floor(bet * mult);

// ---------------------------------------------------------------- welcome bonus
/** One-time welcome: 2,500 marks and a free uncommon name colour. */
export async function claimWelcome(userId: string) {
  await wallet(userId);
  const r = await sqlOne<{ marks: number }>(
    "update arcade_wallets set marks = marks + $2, lifetime_won = lifetime_won + $2, welcomed = 1 where user_id = $1 and welcomed = 0 returning marks", [userId, WELCOME_MARKS]);
  if (!r) throw new ArcadeError("You've already claimed your welcome bonus.");
  const owned = new Set(await ownedCosmetics(userId));
  const pool = COSMETICS.filter((c) => c.kind === "name" && c.rarity === "uncommon" && !owned.has(c.id));
  const gift = pool.length ? pool[randInt(pool.length)] : null;
  if (gift) await sql("insert into cosmetics_owned (user_id, cosmetic_id) values ($1,$2) on conflict do nothing", [userId, gift.id]);
  await logPlay(userId, "welcome", 0, WELCOME_MARKS, { gift: gift?.id });
  return { marks: WELCOME_MARKS, gift, balance: r.marks };
}

// ---------------------------------------------------------------- daily wheel
export const WHEEL = [
  { marks: 100, w: 26 }, { marks: 150, w: 22 }, { marks: 250, w: 19 }, { marks: 400, w: 13 },
  { marks: 600, w: 9 }, { marks: 1000, w: 6 }, { marks: 2500, w: 3.5 }, { marks: 5000, w: 1.5 },
];
const dayKey = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // YYYY-MM-DD, Central
export const canSpinToday = (lastDaily: string | null) => !lastDaily || dayKey(new Date(lastDaily)) !== dayKey();

export async function spinWheel(userId: string) {
  const w = await wallet(userId);
  if (!canSpinToday(w.lastDaily)) throw new ArcadeError("You've spun today. The wheel resets at midnight Central.");
  const yesterday = dayKey(new Date(Date.now() - 24 * 3600_000));
  const streak = w.lastDaily && dayKey(new Date(w.lastDaily)) === yesterday ? w.streak + 1 : 1;
  const total = WHEEL.reduce((a, s) => a + s.w, 0);
  let r = rand() * total, index = 0;
  for (; index < WHEEL.length - 1; index++) { r -= WHEEL[index].w; if (r < 0) break; }
  const bonusPct = Math.min(50, (streak - 1) * 10);
  const marks = Math.floor(WHEEL[index].marks * (1 + bonusPct / 100));
  // Conditional update so a double-click can't spin twice.
  const ok = await sqlOne<{ marks: number }>(
    `update arcade_wallets set marks = marks + $2, lifetime_won = lifetime_won + $2, daily_streak = $3, last_daily = $4
     where user_id = $1 and (last_daily is null or last_daily = $5) returning marks`,
    [userId, marks, streak, new Date().toISOString(), w.lastDaily],
  );
  if (!ok) throw new ArcadeError("You've spun today.");
  await logPlay(userId, "wheel", 0, marks, { index, streak, bonusPct });
  return { index, base: WHEEL[index].marks, marks, streak, bonusPct, balance: ok.marks };
}

// ---------------------------------------------------------------- plinko
export const PLINKO_ROWS = [8, 12, 16] as const;
export const PLINKO_RISKS = ["low", "medium", "high"] as const;
export type PlinkoRisk = (typeof PLINKO_RISKS)[number];
const binom = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
const round = (m: number) => (m >= 100 ? Math.round(m) : m >= 10 ? Math.round(m * 10) / 10 : Math.round(m * 100) / 100);
/** Multipliers per slot: edges pay big, the middle pays little; tuned so the long-run return is ~97%. */
export function plinkoTable(rows: number, risk: PlinkoRisk) {
  const [base, p] = risk === "low" ? [0.5, 2] : risk === "medium" ? [0.3, 3.5] : [0.2, 6];
  const d = (k: number) => Math.abs(k - rows / 2) / (rows / 2);
  let e = 0;
  for (let k = 0; k <= rows; k++) e += (binom(rows, k) / 2 ** rows) * d(k) ** p;
  return Array.from({ length: rows + 1 }, (_, k) => round(base + ((EDGE - base) * d(k) ** p) / e));
}
export function playPlinko(rows: number, risk: PlinkoRisk) {
  if (!PLINKO_ROWS.includes(rows as 8)) throw new ArcadeError("Pick 8, 12 or 16 rows.");
  if (!PLINKO_RISKS.includes(risk)) throw new ArcadeError("Pick a risk.");
  const path = Array.from({ length: rows }, () => (rand() < 0.5 ? 0 : 1));
  const slot = path.reduce((a: number, b) => a + b, 0);
  return { path, slot, mult: plinkoTable(rows, risk)[slot] };
}

// ---------------------------------------------------------------- dice, coin flip
export function playDice(target: number, over: boolean) {
  const t = Math.round(Number(target) * 100) / 100;
  if (!(t >= 2 && t <= 98)) throw new ArcadeError("Target must be between 2 and 98.");
  const chance = over ? (100 - t) / 100 : t / 100;
  const roll = Math.floor(rand() * 10000) / 100;
  const win = over ? roll > t : roll < t;
  const mult = Math.floor((EDGE / chance) * 10000) / 10000;
  return { roll, win, mult, chance };
}
export function playCoin(side: "alliance" | "horde") {
  if (side !== "alliance" && side !== "horde") throw new ArcadeError("Pick a side.");
  const landed = rand() < 0.5 ? "alliance" : "horde";
  return { landed, win: landed === side, mult: 1.94 };
}

// ---------------------------------------------------------------- slots: "Dragon's Hoard"
export const SLOT_SYMBOLS = [
  { id: "dragon", icon: "achievement_boss_onyxia", w: 1, pay3: 250 },
  { id: "gem", icon: "inv_misc_gem_01", w: 2, pay3: 60 },
  { id: "sword", icon: "inv_sword_04", w: 3, pay3: 25 },
  { id: "potion", icon: "inv_potion_51", w: 4, pay3: 12 },
  { id: "rune", icon: "inv_misc_rune_01", w: 5, pay3: 8 },
  { id: "coin", icon: "inv_misc_coin_02", w: 6, pay3: 6 },
] as const;
const SLOT_W = SLOT_SYMBOLS.reduce((a, s) => a + s.w, 0);
/** Paytable: three of a kind pays its line; otherwise a pair pays 0.5x and each dragon adds (1 dragon 1x, 2 dragons 15x). */
export const SLOT_PAIR = 0.5, SLOT_DRAGON_ONE = 1, SLOT_DRAGON_TWO = 15;
function slotMult(r: number[]) {
  const ids = r.map((i) => SLOT_SYMBOLS[i].id);
  if (ids[0] === ids[1] && ids[1] === ids[2]) return SLOT_SYMBOLS[r[0]].pay3;
  const dragons = ids.filter((x) => x === "dragon").length;
  const pair = ids.some((x, i) => x !== "dragon" && ids.indexOf(x) !== i);
  return (dragons === 2 ? SLOT_DRAGON_TWO : dragons === 1 ? SLOT_DRAGON_ONE : 0) + (pair ? SLOT_PAIR : 0);
}
/** Exact long-run return of the paytable (used by the page and to keep the table honest). */
export function slotsRtp() {
  let e = 0;
  const n = SLOT_SYMBOLS.length;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++)
    e += ((SLOT_SYMBOLS[a].w * SLOT_SYMBOLS[b].w * SLOT_SYMBOLS[c].w) / SLOT_W ** 3) * slotMult([a, b, c]);
  return e;
}
export function playSlots() {
  const pick = () => { let r = rand() * SLOT_W, i = 0; for (; i < SLOT_SYMBOLS.length - 1; i++) { r -= SLOT_SYMBOLS[i].w; if (r < 0) break; } return i; };
  const reels = [pick(), pick(), pick()];
  return { reels, mult: slotMult(reels) };
}

// ---------------------------------------------------------------- multi-step rounds (mines, hi-lo, crash)
type Round = { id: string; game: string; bet: number; state: any; status: string; created_at: string };
async function activeRound(userId: string, game: string) {
  const r = await sqlOne<Round>("select id, game, bet, state, status, created_at from arcade_rounds where user_id = $1 and game = $2 and status = 'active' order by created_at desc limit 1", [userId, game]);
  return r ? { ...r, state: JSON.parse(r.state) } : null;
}
async function roundById(userId: string, id: string, game: string) {
  const r = await sqlOne<Round>("select id, game, bet, state, status, created_at from arcade_rounds where id = $1 and user_id = $2 and game = $3", [String(id).slice(0, 64), userId, game]);
  if (!r) throw new ArcadeError("That round wasn't found.");
  return { ...r, state: JSON.parse(r.state) };
}
async function newRound(userId: string, game: string, bet: number, state: unknown) {
  const r = await sqlOne<{ id: string }>("insert into arcade_rounds (user_id, game, bet, state) values ($1,$2,$3,$4) returning id", [userId, game, bet, JSON.stringify(state)]);
  return r!.id;
}
/** Settle a round exactly once: only the request that flips it from active pays. */
async function closeRound(id: string, state: unknown, status: "won" | "lost") {
  const r = await sqlOne<{ id: string }>("update arcade_rounds set state = $2, status = $3 where id = $1 and status = 'active' returning id", [id, JSON.stringify(state), status]);
  return !!r;
}
async function saveRound(id: string, state: unknown) {
  await sql("update arcade_rounds set state = $2 where id = $1 and status = 'active'", [id, JSON.stringify(state)]);
}

// Mines: 5x5 board, you choose how many mines.
export const MINE_TILES = 25;
export const minesMult = (mines: number, safe: number) => {
  let m = EDGE;
  for (let i = 0; i < safe; i++) m *= (MINE_TILES - i) / (MINE_TILES - mines - i);
  return Math.floor(m * 100) / 100;
};
const minesView = (r: { id: string; bet: number; state: any; status: string }) => ({
  id: r.id, bet: r.bet, mines: r.state.mines, revealed: r.state.revealed as number[], status: r.status,
  mult: minesMult(r.state.mines, r.state.revealed.length), next: minesMult(r.state.mines, r.state.revealed.length + 1),
  board: r.status === "active" ? undefined : (r.state.board as number[]),
});
export async function minesStart(userId: string, bet: number, mines: number) {
  const existing = await activeRound(userId, "mines");
  if (existing) return { round: minesView(existing), balance: (await wallet(userId)).marks, resumed: true };
  const m = Math.floor(Number(mines));
  if (!(m >= 1 && m <= 24)) throw new ArcadeError("Pick 1 to 24 mines.");
  const balance = await debit(userId, bet);
  const tiles = Array.from({ length: MINE_TILES }, (_, i) => i);
  for (let i = tiles.length - 1; i > 0; i--) { const j = randInt(i + 1); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
  const board = tiles.slice(0, m).sort((a, b) => a - b);
  const id = await newRound(userId, "mines", bet, { mines: m, board, revealed: [] });
  return { round: minesView({ id, bet, state: { mines: m, board, revealed: [] }, status: "active" }), balance, resumed: false };
}
export async function minesReveal(userId: string, id: string, tile: number) {
  const r = await roundById(userId, id, "mines");
  if (r.status !== "active") throw new ArcadeError("That round is over.");
  const t = Math.floor(Number(tile));
  if (!(t >= 0 && t < MINE_TILES) || r.state.revealed.includes(t)) throw new ArcadeError("Pick a hidden tile.");
  if (r.state.board.includes(t)) {
    const state = { ...r.state, revealed: [...r.state.revealed], hit: t };
    if (await closeRound(r.id, state, "lost")) await logPlay(userId, "mines", r.bet, 0, { mines: r.state.mines, safe: r.state.revealed.length });
    return { round: minesView({ ...r, state, status: "lost" }), hit: t, balance: (await wallet(userId)).marks };
  }
  const state = { ...r.state, revealed: [...r.state.revealed, t] };
  if (state.revealed.length === MINE_TILES - r.state.mines) return minesCashout(userId, r.id, state);
  await saveRound(r.id, state);
  return { round: minesView({ ...r, state }), balance: (await wallet(userId)).marks };
}
export async function minesCashout(userId: string, id: string, stateOverride?: any) {
  const r = await roundById(userId, id, "mines");
  if (r.status !== "active") throw new ArcadeError("That round is over.");
  const state = stateOverride ?? r.state;
  if (!state.revealed.length) throw new ArcadeError("Reveal at least one tile first.");
  const mult = minesMult(state.mines, state.revealed.length), won = pay(r.bet, mult);
  let balance = (await wallet(userId)).marks;
  if (await closeRound(r.id, state, "won")) { balance = await credit(userId, won); await logPlay(userId, "mines", r.bet, won, { mines: state.mines, safe: state.revealed.length, mult }); }
  return { round: minesView({ ...r, state, status: "won" }), won, balance };
}

// Hi-Lo: one card at a time (Ace low, King high). "Higher" wins on same-or-higher, "Lower" on same-or-lower.
const hiloView = (r: { id: string; bet: number; state: any; status: string }) => ({
  id: r.id, bet: r.bet, status: r.status, card: r.state.card as number, mult: r.state.mult as number, history: r.state.history as number[],
  odds: { higher: (14 - r.state.card) / 13, lower: r.state.card / 13 },
});
export async function hiloStart(userId: string, bet: number) {
  const existing = await activeRound(userId, "hilo");
  if (existing) return { round: hiloView(existing), balance: (await wallet(userId)).marks, resumed: true };
  const balance = await debit(userId, bet);
  const state = { card: 1 + randInt(13), mult: 1, history: [] as number[], steps: 0 };
  const id = await newRound(userId, "hilo", bet, state);
  return { round: hiloView({ id, bet, state, status: "active" }), balance, resumed: false };
}
export async function hiloGuess(userId: string, id: string, guess: "higher" | "lower" | "skip") {
  const r = await roundById(userId, id, "hilo");
  if (r.status !== "active") throw new ArcadeError("That round is over.");
  const c = r.state.card as number, next = 1 + randInt(13);
  const history = [...r.state.history, c].slice(-12);
  if (guess === "skip") {
    if ((r.state.skips ?? 0) >= 3) throw new ArcadeError("Only 3 skips per round.");
    const state = { ...r.state, card: next, history, skips: (r.state.skips ?? 0) + 1 };
    await saveRound(r.id, state);
    return { round: hiloView({ ...r, state }), next, win: true, balance: (await wallet(userId)).marks };
  }
  const p = guess === "higher" ? (14 - c) / 13 : c / 13;
  if (p >= 1) throw new ArcadeError(guess === "higher" ? "Everything is same-or-higher than an Ace. Guess lower or skip." : "Everything is same-or-lower than a King. Guess higher or skip.");
  const win = guess === "higher" ? next >= c : next <= c;
  if (!win) {
    const state = { ...r.state, card: next, history };
    if (await closeRound(r.id, state, "lost")) await logPlay(userId, "hilo", r.bet, 0, { steps: r.state.steps });
    return { round: hiloView({ ...r, state, status: "lost" }), next, win: false, balance: (await wallet(userId)).marks };
  }
  const mult = Math.floor(r.state.mult * (EDGE / p) * 100) / 100;
  const state = { ...r.state, card: next, mult, history, steps: r.state.steps + 1 };
  await saveRound(r.id, state);
  return { round: hiloView({ ...r, state }), next, win: true, balance: (await wallet(userId)).marks };
}
export async function hiloCashout(userId: string, id: string) {
  const r = await roundById(userId, id, "hilo");
  if (r.status !== "active") throw new ArcadeError("That round is over.");
  if (!r.state.steps) throw new ArcadeError("Win at least one guess first.");
  const won = pay(r.bet, r.state.mult);
  let balance = (await wallet(userId)).marks;
  if (await closeRound(r.id, r.state, "won")) { balance = await credit(userId, won); await logPlay(userId, "hilo", r.bet, won, { steps: r.state.steps, mult: r.state.mult }); }
  return { round: hiloView({ ...r, status: "won" }), won, balance };
}

// Crash: "Dragonflight". The multiplier climbs until the dragon dives; cash out before it does.
export const crashAt = (ms: number) => Math.floor(Math.exp(0.00011 * Math.max(0, ms)) * 100) / 100; // ~2x at 6.3s, ~10x at 21s
const msFor = (mult: number) => Math.log(mult) / 0.00011;
export async function crashStart(userId: string, bet: number, auto: number | null) {
  const existing = await activeRound(userId, "crash");
  if (existing) await crashSettle(userId, existing); // a stale round from an earlier tab: settle it first
  const balance = await debit(userId, bet);
  const u = rand();
  const point = u < 0.03 ? 1 : Math.min(1000, Math.max(1, Math.floor((EDGE / (1 - u)) * 100) / 100));
  const target = auto && auto >= 1.01 ? Math.min(1000, Math.floor(auto * 100) / 100) : null;
  const state = { point, start: Date.now() + 1200, auto: target }; // short countdown before lift-off
  const id = await newRound(userId, "crash", bet, state);
  return { id, start: state.start, now: Date.now(), auto: target, balance };
}
async function crashSettle(userId: string, r: { id: string; bet: number; state: any; status: string }, cashoutAt?: number) {
  const { point, start, auto } = r.state;
  const elapsed = Date.now() - start;
  const current = crashAt(elapsed);
  // Auto cash-out wins if the target is reached before the dive.
  if (auto && auto < point && current >= auto) return settleWin(userId, r, auto);
  if (current >= point || point <= 1) {
    if (await closeRound(r.id, { ...r.state, end: point }, "lost")) await logPlay(userId, "crash", r.bet, 0, { point });
    return { status: "lost" as const, point, mult: point, won: 0, balance: (await wallet(userId)).marks };
  }
  if (cashoutAt !== undefined) return settleWin(userId, r, Math.max(1, Math.min(current, point - 0.01)));
  return { status: "active" as const, mult: current, now: Date.now(), start };
}
async function settleWin(userId: string, r: { id: string; bet: number; state: any }, mult: number) {
  const won = pay(r.bet, mult);
  let balance = (await wallet(userId)).marks;
  if (await closeRound(r.id, { ...r.state, cashout: mult }, "won")) { balance = await credit(userId, won); await logPlay(userId, "crash", r.bet, won, { point: r.state.point, cashout: mult }); }
  return { status: "won" as const, point: r.state.point, mult, won, balance };
}
export async function crashPoll(userId: string, id: string) {
  const r = await roundById(userId, id, "crash");
  if (r.status !== "active") return { status: r.status as "won" | "lost", point: r.state.point, mult: r.state.cashout ?? r.state.point, won: r.state.cashout ? pay(r.bet, r.state.cashout) : 0, balance: (await wallet(userId)).marks };
  return crashSettle(userId, r);
}
export async function crashCashout(userId: string, id: string) {
  const r = await roundById(userId, id, "crash");
  if (r.status !== "active") return crashPoll(userId, id);
  if (Date.now() < r.state.start) throw new ArcadeError("Wait for lift-off.");
  return crashSettle(userId, r, 0);
}
export const crashTimeTo = msFor;

// ---------------------------------------------------------------- chests
export async function openChest(userId: string, chestId: string) {
  const chest = CHESTS.find((c) => c.id === chestId);
  if (!chest) throw new ArcadeError("Unknown chest.");
  await debit(userId, chest.price);
  const item: Cosmetic = rollChest(chest, rand(), rand());
  const rarity = item.rarity;
  let duplicate = false, refund = 0;
  if (item.kind === "marks") refund = item.marks ?? 0;
  else {
    const added = await sqlOne<{ cosmetic_id: string }>(
      "insert into cosmetics_owned (user_id, cosmetic_id) values ($1,$2) on conflict do nothing returning cosmetic_id", [userId, item.id]);
    if (!added) { duplicate = true; refund = DUPLICATE_REFUND[rarity]; }
  }
  const balance = refund ? await credit(userId, refund) : (await wallet(userId)).marks;
  await logPlay(userId, `chest:${chest.id}`, chest.price, refund, { item: item.id, rarity, duplicate });
  return { item, rarity, duplicate, refund, balance };
}

export async function ownedCosmetics(userId: string) {
  return (await sql<{ cosmetic_id: string }>("select cosmetic_id from cosmetics_owned where user_id = $1", [userId])).map((r) => r.cosmetic_id);
}

export async function equip(userId: string, kind: "name" | "title" | "theme", id: string | null) {
  if (id) {
    const c = COSMETICS.find((x) => x.id === id);
    if (!c || c.kind !== kind) throw new ArcadeError("That isn't a " + kind + " cosmetic.");
    const own = await sqlOne("select 1 from cosmetics_owned where user_id = $1 and cosmetic_id = $2", [userId, id]);
    if (!own) throw new ArcadeError("You don't own that yet. Open chests to find it.");
  }
  const col = kind === "name" ? "name_style" : kind === "title" ? "title" : "site_theme";
  await sql(`update users set ${col} = $2 where id = $1`, [userId, id]);
}

// ---------------------------------------------------------------- lobby data
export async function leaderboard() {
  return sql<{ marks: number; name: string | null; surname: string | null; class: string | null; avatar_url: string | null; slug: string | null; name_style: string | null; title: string | null }>(
    `select w.marks, c.name, c.surname, c.class, c.avatar_url, c.slug, u.name_style, u.title
     from arcade_wallets w join users u on u.id = w.user_id left join characters c on c.id = u.main_character_id
     order by w.marks desc limit 10`);
}
export async function recentWins() {
  return sql<{ game: string; bet: number; payout: number; created_at: string; name: string | null; surname: string | null; class: string | null; name_style: string | null; detail: string | null }>(
    `select p.game, p.bet, p.payout, p.created_at, p.detail, c.name, c.surname, c.class, u.name_style
     from arcade_plays p join users u on u.id = p.user_id left join characters c on c.id = u.main_character_id
     where (p.bet > 0 and p.payout >= p.bet * 3) or p.game like 'chest:%' and p.detail like '%"rarity":"legendary"%' or p.detail like '%"rarity":"epic"%'
     order by p.created_at desc limit 12`);
}

// ---------------------------------------------------------------- council observer pool
// Non-council guildmates back a contender with marks. When the council awards the item, everyone who
// backed the winner splits the whole pool in proportion to their stake. If nobody called it, or the item
// went to someone outside the contenders, every stake is refunded. No house cut.
export const POOL_MAX = 5000;
export async function poolStake(userId: string, itemId: number, characterId: string, stake: number) {
  const s = Math.floor(Number(stake));
  if (!(s >= MIN_BET && s <= POOL_MAX)) throw new ArcadeError(`Stake between ${MIN_BET} and ${POOL_MAX.toLocaleString("en-US")} marks.`);
  const wished = await sqlOne("select 1 from wishlist_items where item_id = $1 and character_id = $2", [itemId, characterId]);
  if (!wished) throw new ArcadeError("That player isn't a contender for this item.");
  const mine = await sqlOne("select 1 from council_pool where item_id = $1 and user_id = $2 and status = 'open'", [itemId, userId]);
  if (mine) throw new ArcadeError("You've already backed someone for this item.");
  const balance = await debit(userId, s);
  await sql("insert into council_pool (item_id, user_id, character_id, stake) values ($1,$2,$3,$4)", [itemId, userId, characterId, s]);
  return { balance };
}

export async function poolSettle(itemId: number, winnerCharacterId: string) {
  const rows = await sql<{ id: string; user_id: string; character_id: string; stake: number }>(
    "select id, user_id, character_id, stake from council_pool where item_id = $1 and status = 'open'", [itemId]);
  if (!rows.length) return { settled: 0 };
  const total = rows.reduce((a, r) => a + r.stake, 0);
  const winners = rows.filter((r) => r.character_id === winnerCharacterId);
  const winStake = winners.reduce((a, r) => a + r.stake, 0);
  await tx(async (q) => {
    for (const r of rows) {
      const won = winStake ? (r.character_id === winnerCharacterId ? Math.floor((r.stake / winStake) * total) : 0) : r.stake;
      const status = winStake ? (won ? "won" : "lost") : "refunded";
      await q("update council_pool set status = $2, payout = $3 where id = $1 and status = 'open'", [r.id, status, won]);
      if (won) await q("update arcade_wallets set marks = marks + $2, lifetime_won = lifetime_won + $2 where user_id = $1", [r.user_id, won]);
      await q("insert into arcade_plays (user_id, game, bet, payout, detail) values ($1,'council-pool',$2,$3,$4)", [r.user_id, r.stake, won, JSON.stringify({ itemId, status })]);
    }
  });
  await grantMarks(rows.map((r) => ({ userId: r.user_id, marks: OBSERVER_MARKS })), "observer", { itemId });
  return { settled: rows.length, total, winners: winners.length };
}

export async function poolFor(itemIds: number[]) {
  if (!itemIds.length) return [];
  return sql<{ item_id: number; user_id: string; character_id: string; stake: number; name: string | null; surname: string | null; class: string | null; avatar_url: string | null; name_style: string | null }>(
    `select p.item_id, p.user_id, p.character_id, p.stake, c.name, c.surname, c.class, c.avatar_url, u.name_style
     from council_pool p join users u on u.id = p.user_id left join characters c on c.id = u.main_character_id
     where p.status = 'open' and p.item_id in (select value from json_each($1))`, [JSON.stringify(itemIds)]);
}

// ---------------------------------------------------------------- rewards for taking part
export const RAID_MARKS = 500, BENCH_MARKS = 250, COUNCIL_VOTE_MARKS = 50, OBSERVER_MARKS = 25;

/** Give marks to each user once (duplicates in the list are ignored). Never throws. */
export async function grantMarks(grants: { userId: string; marks: number }[], reason: string, detail?: unknown) {
  const best = new Map<string, number>();
  for (const g of grants) if (g.userId && g.marks > 0) best.set(g.userId, Math.max(best.get(g.userId) ?? 0, g.marks));
  for (const [userId, marks] of best) {
    try {
      await wallet(userId);
      await credit(userId, marks);
      await logPlay(userId, `reward:${reason}`, 0, marks, detail);
    } catch (e) { console.error("grantMarks", reason, e); }
  }
  return best.size;
}

/** Raids that started 3+ hours ago (within the last week) pay everyone who took part, once. */
export async function rewardCompletedRaids() {
  const now = Date.now();
  const events = await sql<{ id: string; name: string | null; raid: string; starts_at: string }>(
    "select id, name, raid, starts_at from raid_events where rewarded_at is null and starts_at <= $1 and starts_at >= $2",
    [new Date(now - 3 * 3600_000).toISOString(), new Date(now - 7 * 24 * 3600_000).toISOString()]);
  const done: { id: string; name: string; paid: number; starts_at: string }[] = [];
  for (const e of events) {
    // Attendance (from logs or officers) wins; otherwise the signups stand in for it.
    let rows = await sql<{ user_id: string | null; state: string }>(
      "select c.user_id, a.state from attendance a join characters c on c.id = a.character_id where a.event_id = $1 and c.claimed", [e.id]);
    if (!rows.length) rows = await sql<{ user_id: string | null; state: string }>(
      "select c.user_id, s.status as state from signups s join characters c on c.id = s.character_id where s.event_id = $1 and c.claimed", [e.id]);
    const grants = rows.flatMap((r) => {
      if (!r.user_id) return [];
      const marks = ["present", "late", "accepted"].includes(r.state) ? RAID_MARKS : r.state === "bench" ? BENCH_MARKS : 0;
      return marks ? [{ userId: r.user_id, marks }] : [];
    });
    // Claim the event first so two cron runs can't both pay it.
    const claimed = await sqlOne<{ id: string }>("update raid_events set rewarded_at = $2 where id = $1 and rewarded_at is null returning id", [e.id, new Date().toISOString()]);
    if (!claimed) continue;
    const paid = await grantMarks(grants, "raid", { eventId: e.id });
    done.push({ id: e.id, name: e.name ?? e.raid, paid, starts_at: e.starts_at });
  }
  return done;
}

// ================================================================ more games
// ---------------------------------------------------------------- Leap of Faith (limbo)
/** Pick a target; the leap lands somewhere 1x and up. Reach your target and it pays exactly that. P(win) = 0.97 / target. */
export function playLimbo(target: number) {
  const t = Math.floor(Number(target) * 100) / 100;
  if (!(t >= 1.01 && t <= 1000)) throw new ArcadeError("Target between 1.01× and 1,000×.");
  const u = rand();
  const roll = Math.max(1, Math.min(1_000_000, Math.floor((EDGE / (1 - u)) * 100) / 100));
  return { roll, win: roll >= t, mult: t, chance: EDGE / t };
}

// ---------------------------------------------------------------- Roulette (single zero)
export const ROULETTE_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
export type RouletteBet = { kind: "straight" | "red" | "black" | "odd" | "even" | "low" | "high" | "dozen" | "column"; value?: number; amount: number };
const rouletteWins = (b: RouletteBet, n: number) => {
  if (b.kind === "straight") return n === b.value;
  if (n === 0) return false;
  switch (b.kind) {
    case "red": return ROULETTE_RED.includes(n);
    case "black": return !ROULETTE_RED.includes(n);
    case "odd": return n % 2 === 1;
    case "even": return n % 2 === 0;
    case "low": return n <= 18;
    case "high": return n >= 19;
    case "dozen": return Math.ceil(n / 12) === b.value;
    case "column": return ((n - 1) % 3) + 1 === b.value;
  }
};
const ROULETTE_PAYS: Record<RouletteBet["kind"], number> = { straight: 36, red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2, dozen: 3, column: 3 };
export function checkRouletteBets(bets: unknown): RouletteBet[] {
  if (!Array.isArray(bets) || !bets.length || bets.length > 40) throw new ArcadeError("Place between 1 and 40 chips.");
  const out = bets.map((b: any) => {
    const kind = b?.kind as RouletteBet["kind"];
    if (!(kind in ROULETTE_PAYS)) throw new ArcadeError("Unknown bet.");
    const amount = Math.floor(Number(b.amount));
    if (!(amount >= MIN_BET)) throw new ArcadeError(`Each chip is at least ${MIN_BET} marks.`);
    const value = b.value == null ? undefined : Math.floor(Number(b.value));
    if (kind === "straight" && !(value! >= 0 && value! <= 36)) throw new ArcadeError("Pick a number 0-36.");
    if ((kind === "dozen" || kind === "column") && !(value! >= 1 && value! <= 3)) throw new ArcadeError("Pick 1st, 2nd or 3rd.");
    return { kind, value, amount };
  });
  const total = out.reduce((a, b) => a + b.amount, 0);
  if (total > MAX_BET) throw new ArcadeError(`Total bet is at most ${MAX_BET.toLocaleString("en-US")} marks.`);
  return out;
}
export function playRoulette(bets: RouletteBet[]) {
  const n = randInt(37);
  const payout = bets.reduce((a, b) => a + (rouletteWins(b, n) ? b.amount * ROULETTE_PAYS[b.kind] : 0), 0);
  return { number: n, color: n === 0 ? "green" : ROULETTE_RED.includes(n) ? "red" : "black", payout };
}

// ---------------------------------------------------------------- Rune Keno: 40 runes, pick 1-10, 10 drawn
export const KENO_RUNES = 40, KENO_DRAWN = 10;
/** Multiplier by hits, per number of picks. Built from the exact draw odds; ~93-96% back over time, top prize 5,000x. */
export const KENO_PAYS: Record<number, Record<number, number>> = {
  1: { 1: 3.8 }, 2: { 1: 1.5, 2: 6.7 }, 3: { 2: 4.3, 3: 30 }, 4: { 2: 2.1, 3: 8.1, 4: 79 }, 5: { 3: 6, 4: 33, 5: 427 },
  6: { 3: 3.2, 4: 12, 5: 89, 6: 1560 }, 7: { 4: 9.8, 5: 50, 6: 495, 7: 5000 }, 8: { 4: 5.2, 5: 21, 6: 144, 7: 1920, 8: 5000 },
  9: { 5: 18, 6: 95, 7: 883, 8: 5000, 9: 5000 }, 10: { 5: 9.4, 6: 41, 7: 293, 8: 3830, 9: 5000, 10: 5000 },
};
export function playKeno(picks: unknown) {
  const p = Array.isArray(picks) ? [...new Set(picks.map((x) => Math.floor(Number(x))))] : [];
  if (!(p.length >= 1 && p.length <= 10) || p.some((x) => !(x >= 1 && x <= KENO_RUNES))) throw new ArcadeError("Pick 1 to 10 runes.");
  const pool = Array.from({ length: KENO_RUNES }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) { const j = randInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const drawn = pool.slice(0, KENO_DRAWN);
  const hits = p.filter((x) => drawn.includes(x)).length;
  return { drawn, hits, mult: KENO_PAYS[p.length][hits] ?? 0 };
}

// ---------------------------------------------------------------- Treasure Scratch: 3x3 card, three matching symbols win
export const SCRATCH_PRIZES = [
  { id: "dragon", icon: "achievement_boss_onyxia", mult: 50, p: 0.004 },
  { id: "gem", icon: "inv_misc_gem_01", mult: 10, p: 0.02 },
  { id: "sword", icon: "inv_sword_04", mult: 5, p: 0.04 },
  { id: "potion", icon: "inv_potion_51", mult: 2, p: 0.1 },
  { id: "coin", icon: "inv_misc_coin_02", mult: 1, p: 0.15 },
] as const;
export const SCRATCH_FILLER = { id: "rune", icon: "inv_misc_rune_01" } as const;
export function playScratch() {
  let r = rand(), win: (typeof SCRATCH_PRIZES)[number] | null = null;
  for (const s of SCRATCH_PRIZES) { r -= s.p; if (r < 0) { win = s; break; } }
  const symbols = [...SCRATCH_PRIZES.map((s) => s.id), SCRATCH_FILLER.id];
  const cells: string[] = win ? [win.id, win.id, win.id] : [];
  const count = (id: string) => cells.filter((c) => c === id).length;
  while (cells.length < 9) {
    const choices = symbols.filter((s) => s !== win?.id && count(s) < 2); // nothing else may reach three
    cells.push(choices[randInt(choices.length)]);
  }
  for (let i = cells.length - 1; i > 0; i--) { const j = randInt(i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return { cells, win: win?.id ?? null, mult: win?.mult ?? 0 };
}

// ---------------------------------------------------------------- Dragonspire: climb 8 floors, pick a door, avoid the dragons
export const SPIRE_FLOORS = 8;
export const SPIRE_MODES = { easy: { doors: 4, dragons: 1 }, medium: { doors: 3, dragons: 1 }, hard: { doors: 2, dragons: 1 }, expert: { doors: 3, dragons: 2 } } as const;
export type SpireMode = keyof typeof SPIRE_MODES;
export const spireMult = (mode: SpireMode, floors: number) => {
  const m = SPIRE_MODES[mode];
  return Math.floor(EDGE * (m.doors / (m.doors - m.dragons)) ** floors * 100) / 100;
};
const spireView = (r: { id: string; bet: number; state: any; status: string }) => ({
  id: r.id, bet: r.bet, status: r.status, mode: r.state.mode as SpireMode, picks: r.state.picks as number[],
  floor: (r.state.picks as number[]).length, mult: r.state.picks.length ? spireMult(r.state.mode, r.state.picks.length) : 0,
  next: spireMult(r.state.mode, r.state.picks.length + 1),
  // Dragons are only revealed once the round is over.
  dragons: r.status === "active" ? undefined : (r.state.dragons as number[][]),
});
export async function spireStart(userId: string, bet: number, mode: SpireMode) {
  const existing = await activeRound(userId, "spire");
  if (existing) return { round: spireView(existing), balance: (await wallet(userId)).marks, resumed: true };
  if (!(mode in SPIRE_MODES)) throw new ArcadeError("Pick a difficulty.");
  const balance = await debit(userId, bet);
  const m = SPIRE_MODES[mode];
  const dragons = Array.from({ length: SPIRE_FLOORS }, () => {
    const d = Array.from({ length: m.doors }, (_, i) => i);
    for (let i = d.length - 1; i > 0; i--) { const j = randInt(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
    return d.slice(0, m.dragons).sort();
  });
  const state = { mode, dragons, picks: [] as number[] };
  const id = await newRound(userId, "spire", bet, state);
  return { round: spireView({ id, bet, state, status: "active" }), balance, resumed: false };
}
export async function spirePick(userId: string, id: string, door: number) {
  const r = await roundById(userId, id, "spire");
  if (r.status !== "active") throw new ArcadeError("That climb is over.");
  const m = SPIRE_MODES[r.state.mode as SpireMode];
  const d = Math.floor(Number(door));
  if (!(d >= 0 && d < m.doors)) throw new ArcadeError("Pick a door.");
  const floor = r.state.picks.length;
  const state = { ...r.state, picks: [...r.state.picks, d] };
  if (r.state.dragons[floor].includes(d)) {
    if (await closeRound(r.id, state, "lost")) await logPlay(userId, "spire", r.bet, 0, { mode: r.state.mode, floor });
    return { round: spireView({ ...r, state, status: "lost" }), hit: true, balance: (await wallet(userId)).marks };
  }
  if (state.picks.length === SPIRE_FLOORS) return spireCashout(userId, r.id, state);
  await saveRound(r.id, state);
  return { round: spireView({ ...r, state }), hit: false, balance: (await wallet(userId)).marks };
}
export async function spireCashout(userId: string, id: string, stateOverride?: any) {
  const r = await roundById(userId, id, "spire");
  if (r.status !== "active") throw new ArcadeError("That climb is over.");
  const state = stateOverride ?? r.state;
  if (!state.picks.length) throw new ArcadeError("Climb at least one floor first.");
  const mult = spireMult(state.mode, state.picks.length), won = pay(r.bet, mult);
  let balance = (await wallet(userId)).marks;
  if (await closeRound(r.id, state, "won")) { balance = await credit(userId, won); await logPlay(userId, "spire", r.bet, won, { mode: state.mode, floors: state.picks.length, mult }); }
  return { round: spireView({ ...r, state, status: "won" }), hit: false, won, balance };
}

// ---------------------------------------------------------------- Blackjack: dealer stands on 17, blackjack pays 3:2, double on two cards
type Card = { r: number; s: number }; // r 1..13 (Ace..King), s 0..3
const drawCard = (): Card => ({ r: 1 + randInt(13), s: randInt(4) });
export function handValue(h: Card[]) {
  let total = 0, aces = 0;
  for (const c of h) { const v = c.r === 1 ? 11 : Math.min(10, c.r); total += v; if (c.r === 1) aces++; }
  while (total > 21 && aces) { total -= 10; aces--; }
  return total;
}
const isBlackjack = (h: Card[]) => h.length === 2 && handValue(h) === 21;
const bjView = (r: { id: string; bet: number; state: any; status: string }) => {
  const done = r.status !== "active";
  return {
    id: r.id, bet: r.bet, status: r.status, outcome: r.state.outcome as string | undefined, doubled: !!r.state.doubled,
    player: r.state.player as Card[], playerValue: handValue(r.state.player),
    dealer: done ? (r.state.dealer as Card[]) : [r.state.dealer[0]], dealerValue: done ? handValue(r.state.dealer) : handValue([r.state.dealer[0]]),
    hidden: !done, payout: r.state.payout ?? 0,
  };
};
async function bjFinish(userId: string, r: { id: string; bet: number; state: any }, outcome: string, mult: number) {
  const stake = r.state.doubled ? r.bet * 2 : r.bet;
  const won = Math.floor(stake * mult);
  const state = { ...r.state, outcome, payout: won };
  let balance = (await wallet(userId)).marks;
  if (await closeRound(r.id, state, mult > 0 ? "won" : "lost")) {
    if (won) balance = await credit(userId, won);
    await logPlay(userId, "blackjack", stake, won, { outcome, player: handValue(state.player), dealer: handValue(state.dealer) });
  }
  return { round: bjView({ ...r, state, status: mult > 0 ? "won" : "lost" }), won, balance };
}
async function bjDealerPlays(userId: string, r: { id: string; bet: number; state: any }) {
  const dealer = [...r.state.dealer];
  while (handValue(dealer) < 17) dealer.push(drawCard());
  const st = { ...r.state, dealer };
  const p = handValue(st.player), d = handValue(dealer);
  const base = { ...r, state: st };
  if (d > 21) return bjFinish(userId, base, "Dealer busts", 2);
  if (p > d) return bjFinish(userId, base, "You win", 2);
  if (p === d) return bjFinish(userId, base, "Push", 1);
  return bjFinish(userId, base, "Dealer wins", 0);
}
export async function bjStart(userId: string, bet: number) {
  const existing = await activeRound(userId, "blackjack");
  if (existing) return { round: bjView(existing), balance: (await wallet(userId)).marks, resumed: true, won: 0 };
  const balance = await debit(userId, bet);
  const state = { player: [drawCard(), drawCard()], dealer: [drawCard(), drawCard()], doubled: false };
  const id = await newRound(userId, "blackjack", bet, state);
  const r = { id, bet, state };
  // Naturals settle straight away (the dealer peeks).
  if (isBlackjack(state.player) || isBlackjack(state.dealer)) {
    const both = isBlackjack(state.player) && isBlackjack(state.dealer);
    const res = both ? await bjFinish(userId, r, "Push: both blackjack", 1) : isBlackjack(state.player) ? await bjFinish(userId, r, "Blackjack!", 2.5) : await bjFinish(userId, r, "Dealer blackjack", 0);
    return { ...res, resumed: false };
  }
  return { round: bjView({ ...r, status: "active" }), balance, resumed: false, won: 0 };
}
export async function bjAct(userId: string, id: string, action: "hit" | "stand" | "double") {
  const r = await roundById(userId, id, "blackjack");
  if (r.status !== "active") throw new ArcadeError("That hand is over.");
  if (action === "hit") {
    const state = { ...r.state, player: [...r.state.player, drawCard()] };
    const v = handValue(state.player);
    if (v > 21) return bjFinish(userId, { ...r, state }, "Bust", 0);
    if (v === 21) return bjDealerPlays(userId, { ...r, state });
    await saveRound(r.id, state);
    return { round: bjView({ ...r, state }), won: 0, balance: (await wallet(userId)).marks };
  }
  if (action === "double") {
    if (r.state.player.length !== 2 || r.state.doubled) throw new ArcadeError("You can only double on your first two cards.");
    await debit(userId, r.bet);
    const state = { ...r.state, doubled: true, player: [...r.state.player, drawCard()] };
    if (handValue(state.player) > 21) return bjFinish(userId, { ...r, state }, "Bust", 0);
    return bjDealerPlays(userId, { ...r, state });
  }
  return bjDealerPlays(userId, r);
}
