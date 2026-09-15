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

// Match flow (Phase 5) — ticks at 60 Hz unless noted.
export const MIN_PLAYERS = 2;
/** Countdown shown to players before a round starts. */
export const COUNTDOWN_TICKS = 180; // 3s
/** How long the results of a finished round stay on screen before Draft. */
export const ROUND_OVER_TICKS = 120; // 2s
/** How long a round can run before sudden death kicks in. */
export const ROUND_TIME_LIMIT = 3600; // 60s
/** A ring-out (kill-zone elimination) still credits the last player who hit
 *  the victim, as long as the hit landed within this many ticks of the fall. */
export const RING_OUT_CREDIT_TICKS = 180; // 3s
/** Extra chip damage applied (on top of the attack's own damage) to a hit
 *  landed while a round is in sudden death — a documented, deliberately
 *  minimal reading of the plan's "ramps up damage": it's applied from
 *  `MatchDirector` as a post-hoc HP adjustment driven by `hit`/`blocked` fx
 *  events, not a change to `combat/resolve.ts`'s damage formula itself, so
 *  Phase 4's combat tests don't need to know sudden death exists. Arena
 *  shrinking (the plan's other example) is left to Phase 6, which owns real
 *  arena geometry — the testbed arena is static. */
export const SUDDEN_DEATH_BONUS_DAMAGE = 5;
