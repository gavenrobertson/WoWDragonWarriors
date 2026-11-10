// Dragon's Eye 8-ball: table physics, rules and the AI opponent. Pure functions, no DOM, so the
// game component and the AI share exactly the same simulation.

export const W = 1000, H = 500, R = 12, RAIL = 46; // playing surface, ball radius and rail width, in table units
export const MAX_SPEED = 30; // table units per frame at full power
const SUB = 4; // physics substeps per frame (keeps fast balls from tunnelling)
const BALL_E = 0.95, RAIL_E = 0.76;

export type Ball = { id: number; x: number; y: number; vx: number; vy: number; down: boolean };
export type Group = "solids" | "stripes";
export type Level = "apprentice" | "veteran" | "champion";

/** Pocket centres and the point a player aims at to sink a ball there. */
export const POCKETS = [
  { x: -6, y: -6, r: 27, aim: { x: 10, y: 10 } }, { x: W / 2, y: -15, r: 23, aim: { x: W / 2, y: 4 } }, { x: W + 6, y: -6, r: 27, aim: { x: W - 10, y: 10 } },
  { x: -6, y: H + 6, r: 27, aim: { x: 10, y: H - 10 } }, { x: W / 2, y: H + 15, r: 23, aim: { x: W / 2, y: H - 4 } }, { x: W + 6, y: H + 6, r: 27, aim: { x: W - 10, y: H - 10 } },
];
const CM = 34, SM = 25; // corner and side pocket mouths
type Seg = { ax: number; ay: number; bx: number; by: number };
/** Cushions with gaps at the pockets, plus short angled jaws into each pocket. */
export const CUSHIONS: Seg[] = [
  { ax: CM, ay: 0, bx: W / 2 - SM, by: 0 }, { ax: W / 2 + SM, ay: 0, bx: W - CM, by: 0 },
  { ax: CM, ay: H, bx: W / 2 - SM, by: H }, { ax: W / 2 + SM, ay: H, bx: W - CM, by: H },
  { ax: 0, ay: CM, bx: 0, by: H - CM }, { ax: W, ay: CM, bx: W, by: H - CM },
  // corner jaws
  { ax: CM, ay: 0, bx: CM - 16, by: -18 }, { ax: 0, ay: CM, bx: -18, by: CM - 16 },
  { ax: W - CM, ay: 0, bx: W - CM + 16, by: -18 }, { ax: W, ay: CM, bx: W + 18, by: CM - 16 },
  { ax: CM, ay: H, bx: CM - 16, by: H + 18 }, { ax: 0, ay: H - CM, bx: -18, by: H - CM + 16 },
  { ax: W - CM, ay: H, bx: W - CM + 16, by: H + 18 }, { ax: W, ay: H - CM, bx: W + 18, by: H - CM + 16 },
  // side jaws
  { ax: W / 2 - SM, ay: 0, bx: W / 2 - SM + 7, by: -20 }, { ax: W / 2 + SM, ay: 0, bx: W / 2 + SM - 7, by: -20 },
  { ax: W / 2 - SM, ay: H, bx: W / 2 - SM + 7, by: H + 20 }, { ax: W / 2 + SM, ay: H, bx: W / 2 + SM - 7, by: H + 20 },
];

export const HEAD_X = W * 0.25, FOOT = { x: W * 0.73, y: H / 2 };
export const groupOf = (id: number): Group | null => (id >= 1 && id <= 7 ? "solids" : id >= 9 && id <= 15 ? "stripes" : null);

/** A fresh rack: 8 in the middle, a solid and a stripe in the back corners, the rest shuffled. */
export function rack(rand = Math.random): Ball[] {
  const others = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  // apex, then rows; index 4 is the centre of row 3 (the 8); 10 and 14 are the back corners
  const order: number[] = new Array(15);
  order[4] = 8;
  const solid = others.findIndex((n) => n < 8), s1 = others.splice(solid, 1)[0];
  const stripe = others.findIndex((n) => n > 8), s2 = others.splice(stripe, 1)[0];
  const flip = rand() < 0.5;
  order[10] = flip ? s1 : s2; order[14] = flip ? s2 : s1;
  for (let i = 0; i < 15; i++) if (order[i] === undefined) order[i] = others.shift()!;
  const balls: Ball[] = [{ id: 0, x: HEAD_X, y: H / 2, vx: 0, vy: 0, down: false }];
  const dx = R * 2 * Math.cos(Math.PI / 6) + 0.6;
  let k = 0;
  for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) {
    const jitter = (rand() - 0.5) * 0.3;
    balls.push({ id: order[k++], x: FOOT.x + row * dx, y: H / 2 + (i - row / 2) * (R * 2 + 0.6) + jitter, vx: 0, vy: 0, down: false });
  }
  return balls;
}

export const clone = (b: Ball[]) => b.map((x) => ({ ...x }));
export const moving = (balls: Ball[]) => balls.some((b) => !b.down && (b.vx !== 0 || b.vy !== 0));

export type ShotLog = { first: number | null; potted: number[]; rails: number; railAfterHit: boolean };
export const newLog = (): ShotLog => ({ first: null, potted: [], rails: 0, railAfterHit: false });

/** Advance the table one frame. Mutates balls and the shot log. */
export function step(balls: Ball[], log: ShotLog) {
  for (let s = 0; s < SUB; s++) {
    for (const b of balls) { if (b.down) continue; b.x += b.vx / SUB; b.y += b.vy / SUB; }
    // pockets
    for (const b of balls) {
      if (b.down) continue;
      for (const p of POCKETS) if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < p.r * p.r) { b.down = true; b.vx = b.vy = 0; log.potted.push(b.id); break; }
      if (!b.down && (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40)) { b.down = true; b.vx = b.vy = 0; log.potted.push(b.id); }
    }
    // ball to ball
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i]; if (a.down) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]; if (b.down) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = (2 * R - d) / 2;
        a.x -= nx * over; a.y -= ny * over; b.x += nx * over; b.y += ny * over;
        const vr = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vr <= 0) continue;
        const jmp = ((1 + BALL_E) / 2) * vr;
        a.vx -= jmp * nx; a.vy -= jmp * ny; b.vx += jmp * nx; b.vy += jmp * ny;
        if (log.first === null) { if (a.id === 0) log.first = b.id; else if (b.id === 0) log.first = a.id; }
      }
    }
    // cushions
    for (const b of balls) {
      if (b.down) continue;
      for (const c of CUSHIONS) {
        const ex = c.bx - c.ax, ey = c.by - c.ay, len2 = ex * ex + ey * ey;
        const t = Math.max(0, Math.min(1, ((b.x - c.ax) * ex + (b.y - c.ay) * ey) / len2));
        const qx = c.ax + ex * t, qy = c.ay + ey * t, dx = b.x - qx, dy = b.y - qy, d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        b.x = qx + nx * R; b.y = qy + ny * R;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + RAIL_E) * vn * nx; b.vy -= (1 + RAIL_E) * vn * ny;
          b.vx *= 0.985; b.vy *= 0.985;
          log.rails++; if (log.first !== null) log.railAfterHit = true;
        }
      }
    }
  }
  // rolling friction
  for (const b of balls) {
    if (b.down) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp === 0) continue;
    const ns = Math.max(0, sp * 0.988 - 0.045);
    if (ns < 0.03) { b.vx = b.vy = 0; continue; }
    b.vx *= ns / sp; b.vy *= ns / sp;
  }
}

/** Run a whole shot to rest (or a frame cap). */
export function simulate(balls0: Ball[], angle: number, power: number, cap = 1400) {
  const balls = clone(balls0), log = newLog();
  const cue = balls.find((b) => b.id === 0)!;
  const v = Math.max(0.05, Math.min(1, power)) * MAX_SPEED;
  cue.vx = Math.cos(angle) * v; cue.vy = Math.sin(angle) * v;
  for (let f = 0; f < cap && moving(balls); f++) step(balls, log);
  for (const b of balls) { b.vx = 0; b.vy = 0; }
  return { balls, log };
}

// ---------------------------------------------------------------- rules
export type Game = {
  balls: Ball[]; turn: 0 | 1; groups: [Group | null, Group | null]; breakShot: boolean; inHand: boolean; kitchen: boolean;
  winner: 0 | 1 | null; note: string; shots: number;
};
export function newGame(rand = Math.random, breaker: 0 | 1 = 0): Game {
  return { balls: rack(rand), turn: breaker, groups: [null, null], breakShot: true, inHand: true, kitchen: true, winner: null, note: "Break!", shots: 0 };
}
export const onTable = (g: Game | Ball[], id: number) => { const bs = Array.isArray(g) ? g : g.balls; const b = bs.find((x) => x.id === id); return !!b && !b.down; };

/** The balls this player may legally hit first. */
export function targets(g: Game, p: 0 | 1): number[] {
  const grp = g.groups[p];
  const live = g.balls.filter((b) => !b.down && b.id !== 0);
  if (!grp) return live.filter((b) => b.id !== 8).map((b) => b.id);
  const mine = live.filter((b) => groupOf(b.id) === grp).map((b) => b.id);
  return mine.length ? mine : [8];
}

export const NAMES = ["", "Gold", "Sapphire", "Ruby", "Amethyst", "Ember", "Emerald", "Bloodstone", "the Dragon's Eye", "Gold", "Sapphire", "Ruby", "Amethyst", "Ember", "Emerald", "Bloodstone"];

/** Apply a finished shot to the game and return the next state. `who` names players in messages. */
export function resolve(g0: Game, after: Ball[], log: ShotLog, who: [string, string]): Game {
  const g: Game = { ...g0, balls: after, groups: [...g0.groups] as Game["groups"], shots: g0.shots + 1 };
  const p = g0.turn, o = (1 - p) as 0 | 1;
  const legal = targets(g0, p);
  const potted = log.potted;
  const scratch = potted.includes(0);
  const eight = potted.includes(8);
  let foul: string | null = null;
  if (scratch) foul = `${who[p]} scratched`;
  else if (log.first === null) foul = `${who[p]} missed everything`;
  else if (!legal.includes(log.first)) foul = `${who[p]} hit the wrong ball first`;
  else if (!g0.breakShot && potted.length === 0 && !log.railAfterHit) foul = `${who[p]} didn't reach a cushion`;

  if (eight) {
    if (g0.breakShot) {
      // 8 on the break: spot it and carry on
      const b = g.balls.find((x) => x.id === 8)!;
      const spot = freeSpot(g.balls, FOOT.x, FOOT.y);
      b.down = false; b.x = spot.x; b.y = spot.y;
    } else {
      const clearing = legal.length === 1 && legal[0] === 8;
      if (foul || !clearing) return { ...g, winner: o, note: `${who[p]} sank the Dragon's Eye ${foul ? "on a foul" : "too early"}. ${who[o]} wins!`, inHand: false };
      return { ...g, winner: p, note: `${who[p]} sank the Dragon's Eye. ${who[p]} wins!`, inHand: false };
    }
  }

  // groups are decided by the first ball legally potted on an open table (not on the break)
  if (!g0.groups[p] && !g0.breakShot && !foul) {
    const firstObj = potted.find((id) => groupOf(id));
    if (firstObj) { const grp = groupOf(firstObj)!; g.groups[p] = grp; g.groups[o] = grp === "solids" ? "stripes" : "solids"; }
  }
  if (scratch) { const c = g.balls.find((x) => x.id === 0)!; const s = freeSpot(g.balls, HEAD_X, H / 2); c.down = false; c.x = s.x; c.y = s.y; }

  const mineNow = g.groups[p];
  const sankOwn = potted.some((id) => (mineNow ? groupOf(id) === mineNow : groupOf(id) !== null));
  g.breakShot = false; g.kitchen = false;
  if (foul) return { ...g, turn: o, inHand: true, note: `Foul: ${foul}. ${who[o]} has ball in hand.` };
  if (sankOwn) {
    const n = potted.filter((id) => groupOf(id) && (!mineNow || groupOf(id) === mineNow)).length;
    return { ...g, inHand: false, note: `${who[p]} sank ${n === 1 ? "one" : n}${mineNow && !g0.groups[p] ? ` and takes ${mineNow}` : ""}. Shoot again.` };
  }
  return { ...g, turn: o, inHand: false, note: g0.breakShot ? `${who[o]} to shoot. The table is open.` : `${who[o]} to shoot.` };
}

/** Nearest spot to (x, y) along the table's long axis where a ball fits. */
export function freeSpot(balls: Ball[], x: number, y: number) {
  for (let k = 0; k < 400; k++) {
    const tx = Math.min(W - R - 2, Math.max(R + 2, x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3)), ty = y;
    if (placeOk(balls, tx, ty)) return { x: tx, y: ty };
  }
  return { x, y };
}
export function placeOk(balls: Ball[], x: number, y: number, kitchen = false) {
  if (x < R + 1 || x > W - R - 1 || y < R + 1 || y > H - R - 1) return false;
  if (kitchen && x > HEAD_X) return false;
  return balls.every((b) => b.down || b.id === 0 || (b.x - x) ** 2 + (b.y - y) ** 2 >= (2 * R + 1) ** 2);
}

// ---------------------------------------------------------------- aim helper
/** Where the cue ball first touches something along a ray: a ball (with its id) or a cushion. */
export function castAim(balls: Ball[], angle: number) {
  const cue = balls.find((b) => b.id === 0)!;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = Infinity, hit: Ball | null = null;
  for (const b of balls) {
    if (b.down || b.id === 0) continue;
    const fx = b.x - cue.x, fy = b.y - cue.y, t = fx * dx + fy * dy;
    if (t <= 0) continue;
    const perp2 = fx * fx + fy * fy - t * t, r2 = 4 * R * R;
    if (perp2 > r2) continue;
    const d = t - Math.sqrt(r2 - perp2);
    if (d < best) { best = d; hit = b; }
  }
  // cushion (simple box)
  const tx = dx > 0 ? (W - R - cue.x) / dx : dx < 0 ? (R - cue.x) / dx : Infinity;
  const ty = dy > 0 ? (H - R - cue.y) / dy : dy < 0 ? (R - cue.y) / dy : Infinity;
  const wall = Math.min(tx, ty);
  if (wall < best) return { x: cue.x + dx * wall, y: cue.y + dy * wall, ball: null as Ball | null };
  return { x: cue.x + dx * best, y: cue.y + dy * best, ball: hit };
}

// ---------------------------------------------------------------- AI
// aim error (radians), power error, and how many candidate pots each level considers
const NOISE: Record<Level, { ang: number; pow: number; look: number }> = {
  apprentice: { ang: 0.04, pow: 0.12, look: 4 }, veteran: { ang: 0.014, pow: 0.06, look: 8 }, champion: { ang: 0.004, pow: 0.025, look: 14 },
};
const gauss = (rand: () => number) => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function scoreShot(g: Game, angle: number, power: number) {
  const { balls, log } = simulate(g.balls, angle, power);
  const next = resolve(g, balls, log, ["A", "B"]);
  const p = g.turn;
  if (next.winner !== null) return next.winner === p ? 10000 : -10000;
  let s = 0;
  if (next.turn === p) s += 120;
  if (next.inHand && next.turn !== p) s -= 400;
  const mine = next.groups[p];
  for (const id of log.potted) { const gr = groupOf(id); if (!gr) continue; s += !mine || gr === mine ? 90 : -40; }
  // a little credit for leaving the cue ball near the middle (more options next shot)
  const cue = balls.find((b) => b.id === 0)!;
  s -= Math.hypot(cue.x - W / 2, cue.y - H / 2) * 0.02;
  return s;
}

function lineClear(balls: Ball[], ax: number, ay: number, bx: number, by: number, ignore: number[]) {
  const ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey;
  for (const b of balls) {
    if (b.down || ignore.includes(b.id)) continue;
    const t = Math.max(0, Math.min(1, ((b.x - ax) * ex + (b.y - ay) * ey) / len2));
    if ((b.x - ax - ex * t) ** 2 + (b.y - ay - ey * t) ** 2 < (2 * R - 1) ** 2) return false;
  }
  return true;
}

/** Candidate shots: straight lines through a target ball into a pocket. */
function candidates(g: Game, cue: { x: number; y: number }) {
  const out: { angle: number; t: number; cut: number }[] = [];
  for (const id of targets(g, g.turn)) {
    const t = g.balls.find((b) => b.id === id)!;
    for (const p of POCKETS) {
      const ax = p.aim.x - t.x, ay = p.aim.y - t.y, al = Math.hypot(ax, ay);
      const gx = t.x - (ax / al) * 2 * R, gy = t.y - (ay / al) * 2 * R;
      const cx = gx - cue.x, cy = gy - cue.y, cl = Math.hypot(cx, cy);
      if (cl < 1) continue;
      const cut = Math.acos(Math.max(-1, Math.min(1, (cx * ax + cy * ay) / (cl * al))));
      if (cut > 1.35) continue;
      if (!lineClear(g.balls, cue.x, cue.y, gx, gy, [0, id]) || !lineClear(g.balls, t.x, t.y, p.aim.x, p.aim.y, [0, id])) continue;
      out.push({ angle: Math.atan2(cy, cx), t: id, cut });
    }
  }
  return out.sort((a, b) => a.cut - b.cut);
}

/** Choose a cue-ball spot for ball in hand: straight behind a makeable ball. */
export function aiPlace(g: Game, rand = Math.random) {
  const opts: { x: number; y: number; cut: number }[] = [];
  for (const id of targets(g, g.turn)) {
    const t = g.balls.find((b) => b.id === id)!;
    for (const p of POCKETS) {
      const ax = p.aim.x - t.x, ay = p.aim.y - t.y, al = Math.hypot(ax, ay);
      if (!lineClear(g.balls, t.x, t.y, p.aim.x, p.aim.y, [0, id])) continue;
      for (const back of [90, 140, 200]) {
        const x = t.x - (ax / al) * back, y = t.y - (ay / al) * back;
        if (placeOk(g.balls, x, y, g.kitchen) && lineClear(g.balls, x, y, t.x, t.y, [0, id])) opts.push({ x, y, cut: al });
      }
    }
  }
  if (opts.length) { opts.sort((a, b) => a.cut - b.cut); return opts[Math.min(opts.length - 1, Math.floor(rand() * Math.min(3, opts.length)))]; }
  for (let k = 0; k < 200; k++) {
    const x = R + rand() * ((g.kitchen ? HEAD_X : W) - 2 * R), y = R + rand() * (H - 2 * R);
    if (placeOk(g.balls, x, y, g.kitchen)) return { x, y };
  }
  return freeSpot(g.balls, HEAD_X, H / 2);
}

/** Pick the AI's shot: try likely pots at a few strengths, fall back to a safe hit, then add human error. */
export function aiShot(g: Game, level: Level, rand = Math.random) {
  const n = NOISE[level];
  const cue = g.balls.find((b) => b.id === 0)!;
  if (g.breakShot) return { angle: Math.atan2(FOOT.y - cue.y + (rand() - 0.5) * 6, FOOT.x - cue.x), power: 0.95 + rand() * 0.05 };
  let best = { angle: 0, power: 0.5, s: -Infinity };
  const cands = candidates(g, cue).slice(0, n.look);
  for (const c of cands) for (const pw of [0.32, 0.5, 0.72]) {
    const s = scoreShot(g, c.angle, pw);
    if (s > best.s) best = { angle: c.angle, power: pw, s };
  }
  if (best.s < 50) {
    // no good pot: sweep for the least bad legal contact
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const hit = castAim(g.balls, a);
      if (!hit.ball || !targets(g, g.turn).includes(hit.ball.id)) continue;
      for (const pw of [0.3, 0.55]) { const s = scoreShot(g, a, pw); if (s > best.s) best = { angle: a, power: pw, s }; }
    }
  }
  if (best.s === -Infinity) best = { angle: rand() * Math.PI * 2, power: 0.5, s: 0 };
  return { angle: best.angle + gauss(rand) * n.ang, power: Math.max(0.15, Math.min(1, best.power * (1 + gauss(rand) * n.pow))) };
}
