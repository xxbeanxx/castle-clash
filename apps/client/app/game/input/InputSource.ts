/**
 * Anything that can feed the fixed sim tick an input bitmask (keyboard, touch, gamepad).
 * `GameClient` depends only on this, so adding a device never touches the game loop.
 *
 * `sample()` is called exactly once per fixed tick and must include a press that began and ended
 * since the previous sample (see `HeldBits`): a tap shorter than one 16.7 ms tick is still an input.
 */
export interface InputSource {
  attach(): void;
  detach(): void;
  sample(): number;
}
