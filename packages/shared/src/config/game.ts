export const TICK_RATE = 60;
export const PATCH_RATE = 20;
export const MAX_PLAYERS = 6;
export const ROUNDS_TO_WIN = 3;
export const MATCH_ROOM_NAME = "match";

// Movement/physics — px and px/s, y-down (matches PlayerState.x/y and canvas coordinates).
export const PLAYER_WIDTH = 28;
export const PLAYER_HEIGHT = 48;
export const GRAVITY = 2200;
export const MAX_FALL_SPEED = 1400;
export const MOVE_ACCEL = 4000;
export const MOVE_FRICTION = 5000;
export const MAX_RUN_SPEED = 320;
export const JUMP_VELOCITY = 820;
export const SHORT_HOP_MULTIPLIER = 0.45;
export const COYOTE_TICKS = 6;
export const JUMP_BUFFER_TICKS = 8;
export const DROP_THROUGH_TICKS = 10;

// Combat (Phase 4) — ticks at 60 Hz unless noted.
export const MAX_HP = 100;
export const MAX_STAMINA = 100;
export const STAMINA_REGEN_PER_TICK = 0.5;
/** Damage a blocked hit still deals, as a fraction of the attack's `damage`. */
export const BLOCK_DAMAGE_FRACTION = 0.25;
export const BLOCK_STUN_TICKS = 6;
export const GUARD_BROKEN_TICKS = 40;
export const DODGE_STAMINA_COST = 20;
/** Ticks of invulnerability from the start of Dodge (see combat/fsm.ts's
 *  `resolve.test.ts`-driven contract: a dodge started on tick k avoids a hit
 *  on tick k+iframes-1 and takes one on tick k+iframes). */
export const DODGE_IFRAME_TICKS = 10;
/** Total ticks spent in Dodge, including the post-iframe recovery tail. */
export const DODGE_TOTAL_TICKS = 20;
/** Ticks after landing a hit during which AttackRecovery can cancel early
 *  into Dodge (a hit-confirm cancel). */
export const HIT_CONFIRM_TICKS = 6;
