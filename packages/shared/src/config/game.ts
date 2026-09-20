export const TICK_RATE = 60;
export const PATCH_RATE = 20;
export const MAX_PLAYERS = 6;
export const ROUNDS_TO_WIN = 3;
export const MATCH_ROOM_NAME = "match";

/** How a `match` room was made. `quick` and `private` are between humans; `practice` is one human
 *  and 1 to `MAX_PRACTICE_BOTS` bots; `tutorial` is one human and a dummy that never fights back, in
 *  its own small arena, with no rounds and no end. A practice or tutorial room, and any match a bot played
 *  in, is never recorded (ADR 0003). */
export const MATCH_MODES = ["quick", "private", "practice", "tutorial"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export function isMatchMode(value: unknown): value is MatchMode {
  return typeof value === "string" && (MATCH_MODES as readonly string[]).includes(value);
}

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
/** Hard fallback for how long `Draft` waits before moving on regardless of
 *  picks (plan Phase 7 step 4: "auto-picks randomly with the seeded RNG on
 *  timeout") — `match/phase.ts`'s own FSM enforces this independently of
 *  `DraftService`'s per-player auto-pick, so a bug in the latter can't strand
 *  a match in `Draft` forever; `DraftService` uses this same constant so its
 *  auto-pick fires at (at the latest) the same tick this fallback would. */
export const DRAFT_TICKS = 900; // 15s
/** How long a round can run before sudden death kicks in. */
export const ROUND_TIME_LIMIT = 3600; // 60s
/** A ring-out (kill-zone elimination) still credits the last player who hit
 *  the victim, as long as the hit landed within this many ticks of the fall. */
export const RING_OUT_CREDIT_TICKS = 180; // 3s

// Sudden death (Phase 14 step 7) — once a round runs past `ROUND_TIME_LIMIT`,
// `match/phase.ts` counts `suddenDeathTicks` and `sim/GameSimulation.step`
// applies two pressures from it: every hit lands harder (a multiplier that
// ramps from 1 to `SUDDEN_DEATH_MAX_MULTIPLIER` over `SUDDEN_DEATH_RAMP_TICKS`,
// threaded through `resolveCombat`) and everyone alive bleeds. The multiplier
// alone would do nothing to two players who never swing, and a stalemate is
// exactly what F13 was about, so the bleed is the part that guarantees an end:
// `SUDDEN_DEATH_BASE_DRAIN_PER_SECOND` HP/s, scaled by the same multiplier, kills
// a full-health knight in roughly 14 s (`match/suddenDeath.test.ts` pins it).
export const SUDDEN_DEATH_RAMP_TICKS = 900; // 15s to full strength
export const SUDDEN_DEATH_MAX_MULTIPLIER = 4;
export const SUDDEN_DEATH_BASE_DRAIN_PER_SECOND = 3;

// Solo play (Phase 14) — ticks at 60 Hz.
/** How long a human waits alone in a public quick-play room before the server offers them a bot.
 *  Short enough that a lone visitor is fighting inside the 10 s the plan's gate asks for once
 *  they say yes, long enough that a room with people about to arrive is not a bot match. */
export const BACKFILL_OFFER_TICKS = 480; // 8s

// Arenas and hazards (Phase 6) — ticks at 60 Hz unless noted.
/** FireZone's per-tick outward nudge while a player stands in it — small on
 *  purpose ("hitstun-free knockback" per the plan, not a real launch). */
export const FIRE_ZONE_KNOCKBACK_SPEED = 60;
/** How long a TimedTrap's damage/knockback burst applies for once its warn
 *  window ends — not named in the plan's `TimedTrap` field list (only
 *  `periodTicks`/`warnTicks` are), same precedent as `SimPlayer`'s
 *  non-headline fields: a trap needs *some* active duration distinct from
 *  its instant-elimination KillZone sibling. */
export const TIMED_TRAP_ACTIVE_TICKS = 10;
export const TIMED_TRAP_HITSTUN_TICKS = 18;
