import type { Raster, Rgb } from "./raster.js";

/** Looks a sprite up by its world-atlas name (`art/world/build_atlas.py`). */
export type SpriteSource = (name: string) => Raster;

export interface BlockSpec {
  /** World-atlas name of the tiled fill, e.g. `fill/brick`. */
  fill: string;
  cap: readonly Rgb[];
  shade: number;
  /** Multiplies the fill (default 1). */
  brightness?: number;
}

export interface ArenaTheme {
  solid: BlockSpec;
  platform: BlockSpec;
  /** What breakable floors and collapsing platforms are made of. */
  hazardBlock: BlockSpec;
  background: {
    fill: string;
    tint: Rgb;
    dim: number;
    /** Props sit behind the fight, so they are drawn darker than the terrain. */
    propDim: number;
  };
  /** Decoration only, in art pixels (top-left of the sprite); never affects the sim. */
  props: readonly { sprite: string; x: number; y: number }[];
}

const STEEL_CAP: readonly Rgb[] = [
  [0xc0, 0xcb, 0xdc],
  [0x8b, 0x9b, 0xb4],
];
const SAND_CAP: readonly Rgb[] = [
  [0xd9, 0xa0, 0x6a],
  [0xb8, 0x84, 0x58],
];
const WOOD_CAP: readonly Rgb[] = [[0xcf, 0x82, 0x54]];
const DIRT_CAP: readonly Rgb[] = [
  [0xbd, 0x6c, 0x4a],
  [0x8f, 0x4e, 0x3f],
];

const PLANKS: BlockSpec = { fill: "fill/plank", cap: WOOD_CAP, shade: 0.8 };
const STONE: BlockSpec = { fill: "fill/brick", cap: STEEL_CAP, shade: 0.75, brightness: 0.8 };

// Floor top is at art y 340 in the 640x360 arenas, so a 16 px prop standing on it has y 324.
const FLOOR_PROP = 324;

const CASTLE_ROOM: ArenaTheme = {
  solid: STONE,
  platform: PLANKS,
  hazardBlock: PLANKS,
  background: { fill: "fill/stone", tint: [190, 175, 215], dim: 0.5, propDim: 0.85 },
  props: [
    { sprite: "prop/banner", x: 60, y: 60 },
    { sprite: "prop/banner", x: 210, y: 60 },
    { sprite: "prop/banner", x: 430, y: 60 },
    { sprite: "prop/banner", x: 570, y: 60 },
    { sprite: "prop/shield", x: 320, y: 120 },
    { sprite: "prop/chest", x: 520, y: 264 },
    { sprite: "prop/barrel", x: 40, y: FLOOR_PROP },
  ],
};

export const ARENA_THEMES: Readonly<Record<string, ArenaTheme>> = {
  castleRoom: CASTLE_ROOM,
  pit: {
    solid: { fill: "fill/dirt", cap: DIRT_CAP, shade: 0.7 },
    platform: PLANKS,
    hazardBlock: PLANKS,
    background: { fill: "fill/stone", tint: [150, 150, 200], dim: 0.46, propDim: 0.85 },
    props: [
      { sprite: "prop/gargoyle", x: 60, y: 90 },
      { sprite: "prop/gargoyle", x: 564, y: 90 },
      { sprite: "prop/grave", x: 30, y: 284 },
      { sprite: "prop/barrel", x: 570, y: 284 },
    ],
  },
  colosseum: {
    solid: { fill: "fill/sand", cap: SAND_CAP, shade: 0.8, brightness: 0.62 },
    platform: PLANKS,
    hazardBlock: PLANKS,
    background: { fill: "fill/sand", tint: [255, 190, 150], dim: 0.4, propDim: 0.8 },
    props: [
      { sprite: "prop/banner", x: 80, y: 40 },
      { sprite: "prop/banner", x: 300, y: 60 },
      { sprite: "prop/banner", x: 340, y: 60 },
      { sprite: "prop/banner", x: 550, y: 40 },
      { sprite: "prop/shield", x: 44, y: 250 },
      { sprite: "prop/shield", x: 580, y: 250 },
      { sprite: "prop/barrel", x: 150, y: FLOOR_PROP },
      { sprite: "prop/crate", x: 470, y: FLOOR_PROP },
    ],
  },
  bridge: {
    solid: { fill: "fill/stone", cap: STEEL_CAP, shade: 0.7, brightness: 0.8 },
    platform: PLANKS,
    hazardBlock: PLANKS,
    background: { fill: "fill/stone", tint: [120, 130, 190], dim: 0.42, propDim: 0.85 },
    props: [
      { sprite: "prop/gargoyle", x: 100, y: 200 },
      { sprite: "prop/gargoyle", x: 524, y: 200 },
      { sprite: "prop/banner", x: 300, y: 120 },
      { sprite: "prop/banner", x: 330, y: 120 },
    ],
  },
  woodenHall: {
    solid: PLANKS,
    platform: PLANKS,
    hazardBlock: PLANKS,
    background: { fill: "fill/plank", tint: [190, 150, 130], dim: 0.42, propDim: 0.8 },
    props: [
      { sprite: "prop/shelf", x: 30, y: 292 },
      { sprite: "prop/shelf", x: 50, y: 292 },
      { sprite: "prop/barrel", x: 300, y: FLOOR_PROP },
      { sprite: "prop/chest", x: 330, y: FLOOR_PROP },
      { sprite: "prop/crate", x: 585, y: FLOOR_PROP },
      { sprite: "prop/banner", x: 250, y: 60 },
    ],
  },
  dungeon: {
    solid: { fill: "fill/brick", cap: STEEL_CAP, shade: 0.7, brightness: 0.8 },
    platform: PLANKS,
    hazardBlock: PLANKS,
    background: { fill: "fill/brick", tint: [150, 140, 170], dim: 0.46, propDim: 0.85 },
    props: [
      { sprite: "prop/gargoyle", x: 40, y: 80 },
      { sprite: "prop/gargoyle", x: 584, y: 80 },
      { sprite: "prop/shield", x: 150, y: 90 },
      { sprite: "prop/shield", x: 474, y: 90 },
      { sprite: "prop/grave", x: 30, y: 174 },
    ],
  },
};

/** The theme for an arena id; the tutorial and any arena without its own get the castle room's. */
export function themeFor(arenaId: string): ArenaTheme {
  return ARENA_THEMES[arenaId] ?? CASTLE_ROOM;
}
