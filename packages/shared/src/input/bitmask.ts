export const INPUT_BITS = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  UP: 1 << 2,
  DOWN: 1 << 3,
  JUMP: 1 << 4,
  LIGHT: 1 << 5,
  HEAVY: 1 << 6,
  BLOCK: 1 << 7,
  DODGE: 1 << 8,
} as const;

export type InputBitName = keyof typeof INPUT_BITS;

const ALL_BITS_MASK = Object.values(INPUT_BITS).reduce((acc, bit) => acc | bit, 0);

export interface InputFrame {
  seq: number;
  bits: number;
}

export function encode(pressed: readonly InputBitName[]): number {
  return pressed.reduce((bits, name) => bits | INPUT_BITS[name], 0);
}

export function decode(bits: number): InputBitName[] {
  if ((bits & ~ALL_BITS_MASK) !== 0) {
    throw new Error(`bitmask contains unknown bits: ${bits}`);
  }
  return (Object.keys(INPUT_BITS) as InputBitName[]).filter((name) => has(bits, name));
}

export function has(bits: number, name: InputBitName): boolean {
  return (bits & INPUT_BITS[name]) !== 0;
}
