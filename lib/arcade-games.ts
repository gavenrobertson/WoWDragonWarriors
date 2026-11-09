// Arcade game list and small helpers shared by server pages and client components.
export const GAMES = [
  { slug: "plinko", name: "Plinko", blurb: "Drop a mark through the pegs", icon: "inv_misc_orb_05" },
  { slug: "mines", name: "Mines", blurb: "Find gems, dodge the bombs", icon: "inv_misc_bomb_04" },
  { slug: "dragonflight", name: "Dragonflight", blurb: "Cash out before the dragon dives", icon: "achievement_boss_onyxia" },
  { slug: "hilo", name: "Higher or Lower", blurb: "Call the next card", icon: "inv_misc_ticket_darkmoon_01" },
  { slug: "slots", name: "Dragon's Hoard", blurb: "Three reels of treasure", icon: "inv_misc_coin_02" },
  { slug: "dice", name: "Dice", blurb: "Pick your odds, roll", icon: "inv_misc_dice_01" },
  { slug: "coinflip", name: "Faction Flip", blurb: "Alliance or Horde?", icon: "achievement_pvp_a_a" },
] as const;

export const wowIconUrl = (name: string, size: 36 | 56 = 56) => `https://render.worldofwarcraft.com/us/icons/${size}/${name}.jpg`;
export const fmt = (n: number) => n.toLocaleString("en-US");
