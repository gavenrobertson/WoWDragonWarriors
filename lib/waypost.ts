// Waypost: the guild's leveling-guide addon for WoW Forever, published on CurseForge.
export const WAYPOST = {
  curseforge: "https://www.curseforge.com/wow/addons/waypost-ding",
  download: "https://www.curseforge.com/wow/addons/waypost-ding/files/9612635",
  github: "https://github.com/gavenrobertson/WayPost",
  issues: "https://github.com/gavenrobertson/WayPost/issues",
  polestar: "https://github.com/fitzforge/polestar",
  version: "1.0.0",
  gameVersion: "1.60.1",
  size: "1.4 MB",
  license: "GPL-3.0",
};

export const WAYPOST_FEATURES: { icon: string; title: string; points: string[] }[] = [
  {
    icon: "window",
    title: "The guide window",
    points: [
      "A card at the top says the one thing to do right now: the quest, mob or item, who gives or takes the quest, what drops the item, and how far away it is.",
      "The rest of the step's goals sit under it and tick themselves off as you do them, in combat too.",
      "XP per hour and time to level sit in the corner. Click for a graph of how long each level took.",
      "A level-up banner plays when you ding. There's a compact mode and three window styles.",
    ],
  },
  {
    icon: "arrow",
    title: "The arrow",
    points: [
      "A 3D gold arrow points at your next objective and turns as you turn, with the distance and a rough travel time under it.",
      "It points down and goes green when you arrive.",
      "Pins go on the world map and minimap, with dots where the step's mobs or items are found.",
      "Use TomTom? One setting hands the waypoint to TomTom instead.",
    ],
  },
  {
    icon: "hand",
    title: "Less clicking",
    points: [
      "Picks up and hands in the guide's quests for you. It stops when there's a reward to choose and never touches quests outside the guide.",
      "Hold Shift when you open an NPC if you'd rather do it yourself.",
      "A button for the step's quest item and one to target the mob or NPC, both bindable to keys.",
      "Tracks your flight paths and takes the flight the guide wants.",
    ],
  },
  {
    icon: "compass",
    title: "When you're stuck",
    points: [
      "Skip drops a step, and anything later that needed its quests too, so the guide never waits on something you skipped. Undo brings it back.",
      "Later sets a step aside and offers it back when you join a party or gain a couple of levels.",
      "Short on XP for the next leg? It shows how much and points you at set-aside quests or the nearest mobs your level.",
      "Did some quests without it? “Re-read my quest log” catches the guide up.",
    ],
  },
  {
    icon: "party",
    title: "Level with friends",
    points: [
      "Party panel: see which guide and step everyone is on, pull the party onto your guide, share a quest someone missed.",
      "Guild board: who's on which guide and at what level.",
      "Officers can set a guide for the whole guild and send notices.",
      "Group quests are set aside while you're solo and flagged when you join a party.",
    ],
  },
  {
    icon: "spark",
    title: "And more",
    points: [
      "Suggests a talent when you level up.",
      "Flags quest rewards and vendor items that beat what you're wearing, using Pawn if you have it.",
      "Warns about elite and group quests, and has a safer route for Hardcore.",
      "Write your own guides in a simple text format, or record one by playing it, and share them as import strings.",
    ],
  },
];

export const WAYPOST_COMMANDS: [string, string][] = [
  ["/waypost", "Show or hide the guide window"],
  ["/waypost guides", "Pick a guide"],
  ["/waypost config", "Settings"],
  ["/waypost help", "The welcome and help window"],
  ["/waypost later", "Quests you set aside"],
  ["/waypost xp", "Leveling speed and the time-per-level graph"],
  ["/waypost party", "Party progress"],
  ["/waypost guild", "Guild leveling board"],
  ["/waypost report", "A report to paste when a step is wrong"],
];
