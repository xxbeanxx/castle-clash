import { encode, type InputBitName, type InputFrame } from "../../input/bitmask.js";

/** A bot's whole input history, one frame per tick, seq starting at 1. */
export type BotScript = readonly InputFrame[];

export function holdBits(bits: number, ticks: number, startSeq = 1): BotScript {
  return Array.from({ length: ticks }, (_, i) => ({ seq: startSeq + i, bits }));
}

export function hold(names: readonly InputBitName[], ticks: number, startSeq = 1): BotScript {
  return holdBits(encode(names), ticks, startSeq);
}

export function idle(ticks: number, startSeq = 1): BotScript {
  return holdBits(0, ticks, startSeq);
}

/** Concatenates scripts into one continuous, correctly-renumbered sequence. */
export function sequence(...scripts: readonly BotScript[]): BotScript {
  const frames: InputFrame[] = [];
  let seq = 1;
  for (const script of scripts) {
    for (const frame of script) {
      frames.push({ seq: seq++, bits: frame.bits });
    }
  }
  return frames;
}
