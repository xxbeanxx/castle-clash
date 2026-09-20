import {
  BLOCK_STUN_TICKS,
  DODGE_TOTAL_TICKS,
  getAttack,
  getWeapon,
  isActionState,
  isAttackKind,
  isWeaponId,
  WEAPON_IDS,
  type ActionState,
  type AttackKind,
  type WeaponId,
} from "@castle-clash/shared";

/**
 * Pure `synced player state -> {clip, frame}` (Phase 15 step 6). It is the contract between the art
 * and the sim: `LOOP_CLIPS` and `ATTACK_CLIPS` name every animation tag the atlas must contain and how
 * many frames each has, and `docs/art/BIBLE.md` says how a clip is authored. Nothing here touches Pixi.
 *
 * `actionTick` counts ticks since the last `ActionState` change (`combat/fsm.ts`), and it keeps
 * counting in `Idle`/`Run`, so it is the clock for every clip, looping or not.
 */

export type KnightClip =
  | "idle"
  | "run"
  | "jump-rise"
  | "jump-fall"
  | "block"
  | "block-stun"
  | "dodge"
  | "hit-stun"
  | "guard-broken"
  | "dead";

/** An attack clip is one per weapon and attack kind, e.g. `spear-attack-heavy`. */
export type AttackClip = `${WeaponId}-attack-${"light" | "heavy" | "air"}`;

export type AnyClip = KnightClip | AttackClip;

export interface LoopClipSpec {
  /** Frames the art must provide. */
  frames: number;
  /** Sim ticks each frame is held for. */
  ticksPerFrame: number;
  /** `false` holds the last frame instead of wrapping. */
  loop: boolean;
}

/** How many art frames an attack spends in each phase. The renderer stretches the phase's ticks
 *  over these frames, so startup is the anticipation, active is the strike and recovery the
 *  follow-through, whatever the phase's tick count is. */
export interface AttackClipSpec {
  startup: number;
  active: number;
  recovery: number;
}

export const LOOP_CLIPS: Readonly<Record<KnightClip, LoopClipSpec>> = {
  idle: { frames: 4, ticksPerFrame: 12, loop: true },
  run: { frames: 6, ticksPerFrame: 5, loop: true },
  "jump-rise": { frames: 2, ticksPerFrame: 6, loop: false },
  "jump-fall": { frames: 2, ticksPerFrame: 6, loop: true },
  block: { frames: 2, ticksPerFrame: 4, loop: false },
  "block-stun": { frames: 2, ticksPerFrame: Math.ceil(BLOCK_STUN_TICKS / 2), loop: false },
  dodge: { frames: 4, ticksPerFrame: Math.ceil(DODGE_TOTAL_TICKS / 4), loop: false },
  "hit-stun": { frames: 3, ticksPerFrame: 4, loop: false },
  "guard-broken": { frames: 3, ticksPerFrame: 6, loop: false },
  dead: { frames: 5, ticksPerFrame: 6, loop: false },
};

/** Placeholder frame budget per phase; the real numbers come from the art (bible: "attack clips"). */
const DEFAULT_ATTACK_SPEC: AttackClipSpec = { startup: 2, active: 2, recovery: 3 };

export const ATTACK_CLIPS: Readonly<Record<AttackClip, AttackClipSpec>> = Object.fromEntries(
  Object.values(WEAPON_IDS).flatMap((weapon) =>
    (["light", "heavy", "air"] as const).map((kind) => [
      `${weapon}-attack-${kind}`,
      DEFAULT_ATTACK_SPEC,
    ]),
  ),
) as Record<AttackClip, AttackClipSpec>;

export interface KnightPoseInput {
  action: string;
  actionTick: number;
  weapon: string;
  attackKind: string;
  vy: number;
}

export interface KnightPose {
  clip: AnyClip;
  /** Zero-based, always `< clipLength(clip)`. */
  frame: number;
}

export function clipLength(clip: AnyClip): number {
  if (clip in LOOP_CLIPS) {
    return LOOP_CLIPS[clip as KnightClip].frames;
  }
  const spec = ATTACK_CLIPS[clip as AttackClip];
  return spec.startup + spec.active + spec.recovery;
}

/** Every clip name the atlas must contain, for `assets:check`. */
export function allClips(): AnyClip[] {
  return [
    ...(Object.keys(LOOP_CLIPS) as KnightClip[]),
    ...(Object.keys(ATTACK_CLIPS) as AttackClip[]),
  ];
}

export function attackClip(weapon: WeaponId, kind: AttackKind): AttackClip {
  return `${weapon}-attack-${kind === "airLight" ? "air" : kind}`;
}

function loopFrame(spec: LoopClipSpec, tick: number): number {
  const step = Math.floor(Math.max(0, tick) / spec.ticksPerFrame);
  return spec.loop ? step % spec.frames : Math.min(step, spec.frames - 1);
}

/** Spreads `tick` of `length` sim ticks across `frames` art frames (never past the last). */
function phaseFrame(tick: number, length: number, frames: number): number {
  if (length <= 0) {
    return frames - 1;
  }
  const clamped = Math.min(Math.max(0, tick), length - 1);
  return Math.min(frames - 1, Math.floor((clamped * frames) / length));
}

export function knightPose(input: KnightPoseInput): KnightPose {
  const action: ActionState = isActionState(input.action) ? input.action : "Idle";
  const weaponId: WeaponId = isWeaponId(input.weapon) ? input.weapon : WEAPON_IDS.SWORD;
  const tick = input.actionTick;

  switch (action) {
    case "AttackStartup":
    case "AttackActive":
    case "AttackRecovery": {
      const kind: AttackKind = isAttackKind(input.attackKind) ? input.attackKind : "light";
      const clip = attackClip(weaponId, kind);
      const spec = ATTACK_CLIPS[clip];
      const attack = getAttack(getWeapon(weaponId), kind);
      if (action === "AttackStartup") {
        return { clip, frame: phaseFrame(tick, attack.startup, spec.startup) };
      }
      if (action === "AttackActive") {
        return { clip, frame: spec.startup + phaseFrame(tick, attack.active, spec.active) };
      }
      return {
        clip,
        frame: spec.startup + spec.active + phaseFrame(tick, attack.recovery, spec.recovery),
      };
    }
    case "Airborne": {
      const clip: KnightClip = input.vy < 0 ? "jump-rise" : "jump-fall";
      return { clip, frame: loopFrame(LOOP_CLIPS[clip], tick) };
    }
    case "Run":
      return { clip: "run", frame: loopFrame(LOOP_CLIPS.run, tick) };
    case "Block":
      return { clip: "block", frame: loopFrame(LOOP_CLIPS.block, tick) };
    case "BlockStun":
      return { clip: "block-stun", frame: loopFrame(LOOP_CLIPS["block-stun"], tick) };
    case "Dodge":
      return { clip: "dodge", frame: loopFrame(LOOP_CLIPS.dodge, tick) };
    case "HitStun":
      return { clip: "hit-stun", frame: loopFrame(LOOP_CLIPS["hit-stun"], tick) };
    case "GuardBroken":
      return { clip: "guard-broken", frame: loopFrame(LOOP_CLIPS["guard-broken"], tick) };
    case "Dead":
      return { clip: "dead", frame: loopFrame(LOOP_CLIPS.dead, tick) };
    case "Idle":
      return { clip: "idle", frame: loopFrame(LOOP_CLIPS.idle, tick) };
  }
}
