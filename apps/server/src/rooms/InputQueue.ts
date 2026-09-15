import type { InputFrame } from "@castle-clash/shared";

const MAX_DEPTH = 8;
const REPEAT_LIMIT = 6;

interface PlayerInputState {
  buffer: InputFrame[];
  lastSeq: number;
  lastFrame: InputFrame | undefined;
  repeatCount: number;
}

function createPlayerState(): PlayerInputState {
  return { buffer: [], lastSeq: 0, lastFrame: undefined, repeatCount: 0 };
}

/**
 * Per-player ring buffer of authoritative-pending inputs. Caps depth at 8
 * (dropping the oldest, which blocks flooding the server with buffered
 * input), rejects a `seq` that doesn't strictly increase (stale/replayed
 * frames), and — since network gaps are normal, not exceptional — makes
 * `consume()` total: it repeats the last real frame for up to 6 ticks, then
 * falls back to neutral (bits 0) so `MatchRoom`'s tick loop never needs an
 * empty-input branch.
 */
export class InputQueue {
  readonly #players = new Map<string, PlayerInputState>();

  push(sessionId: string, frame: InputFrame): boolean {
    const state = this.#players.get(sessionId) ?? createPlayerState();
    if (frame.seq <= state.lastSeq) {
      return false;
    }

    state.buffer.push(frame);
    if (state.buffer.length > MAX_DEPTH) {
      state.buffer.shift();
    }
    state.lastSeq = frame.seq;
    this.#players.set(sessionId, state);
    return true;
  }

  consume(sessionId: string): InputFrame {
    const state = this.#players.get(sessionId);
    if (!state) {
      return { seq: 0, bits: 0 };
    }

    const next = state.buffer.shift();
    if (next) {
      state.lastFrame = next;
      state.repeatCount = 0;
      return next;
    }

    state.repeatCount += 1;
    if (state.lastFrame && state.repeatCount <= REPEAT_LIMIT) {
      return state.lastFrame;
    }
    return { seq: state.lastFrame?.seq ?? 0, bits: 0 };
  }

  removePlayer(sessionId: string): void {
    this.#players.delete(sessionId);
  }
}
