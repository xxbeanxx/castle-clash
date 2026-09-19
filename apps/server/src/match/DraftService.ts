import {
  DRAFT_TICKS,
  generateOffers,
  hashSeed,
  isPowerUpId,
  mulberry32,
  type PlayerId,
  type PowerUpId,
} from "@castle-clash/shared";

export interface DraftOffer {
  offers: readonly [PowerUpId, PowerUpId, PowerUpId];
  endsAtTick: number;
}

export interface DraftRoundPlayer {
  id: PlayerId;
  /** `1` = won the round just finished, `2` = didn't — fed straight into
   *  `generateOffers`'s catch-up weighting (plan step 3/4: "boosts rarity
   *  for players who lost the round"). A deliberate simplification for
   *  matches with more than two players: every non-winner gets the same
   *  placement rather than a true per-player rank by, say, survival time —
   *  nothing in this phase's plan or tests needs a finer-grained rank, and a
   *  real one would need `MatchDirector` to track elimination order, not
   *  just who's still alive. */
  placement: number;
  ownedStacks: Readonly<Partial<Record<PowerUpId, number>>>;
}

/**
 * Server-side draft orchestration (plan Phase 7 step 4) — generates each
 * player's seeded, private offer, validates picks, and auto-picks anyone who
 * times out. Deliberately has no idea what a `Room`/`Client` is, the same
 * discipline `MatchDirector` holds itself to: `MatchRoom` is the only thing
 * that turns `startRound`'s returned offers into a private
 * `client.send(MESSAGE_TYPES.DRAFT_OFFER, ...)` per player, and the only
 * thing that turns `drainPicks()`'s output into a `SimState.powerups` stack
 * increment. That split is what makes this class testable without booting a
 * Colyseus test server (see `DraftService.test.ts`).
 */
export class DraftService {
  readonly #matchSeed: number;
  #round = 0;
  readonly #offers = new Map<PlayerId, DraftOffer>();
  readonly #picks = new Map<PlayerId, PowerUpId>();
  readonly #applied = new Set<PlayerId>();

  constructor(matchSeed: number) {
    this.#matchSeed = matchSeed;
  }

  /** Called once, the tick `match/phase.ts`'s `draftStart` event fires —
   *  seeds every player's offer with `hashSeed(matchSeed, round, playerId)`
   *  (plan step 3), so replaying the same match/round/player always draws
   *  the same three ids. Returns the offers for the caller to send; also
   *  readable afterward via {@link offersFor}. */
  startRound(round: number, tick: number, players: readonly DraftRoundPlayer[]): ReadonlyMap<PlayerId, DraftOffer> {
    this.#round = round;
    this.#offers.clear();
    this.#picks.clear();
    this.#applied.clear();

    const endsAtTick = tick + DRAFT_TICKS;
    for (const player of players) {
      const rng = mulberry32(hashSeed(this.#matchSeed, round, player.id));
      const offers = generateOffers(rng, player.ownedStacks, player.placement);
      this.#offers.set(player.id, { offers, endsAtTick });
    }
    return new Map(this.#offers);
  }

  offersFor(playerId: PlayerId): DraftOffer | undefined {
    return this.#offers.get(playerId);
  }

  /** Validates and records a manual pick (plan step 4: "`id` must be in that
   *  player's offers, once only"). Returns whether it was accepted — a
   *  rejected pick (unknown player, already picked, or an id outside that
   *  player's own three offers) is silently dropped by the caller, the same
   *  way `MatchRoom.#onInput` drops a malformed input frame. */
  pick(playerId: PlayerId, id: string): boolean {
    if (this.#picks.has(playerId)) {
      return false;
    }
    const offer = this.#offers.get(playerId);
    if (!offer || !isPowerUpId(id) || !offer.offers.includes(id)) {
      return false;
    }
    this.#picks.set(playerId, id);
    return true;
  }

  /** Auto-picks anyone still un-picked once `tick` reaches their offer's
   *  `endsAtTick` (plan step 4: "auto-picks randomly with the seeded RNG on
   *  timeout") — seeded independently of the offer-generation draw (that
   *  rng's already been consumed drawing 3 ids), so replaying the same
   *  match/round/player auto-picks the same way every time. Call once per
   *  server tick while a draft is in progress. */
  tick(tick: number): void {
    for (const [id, offer] of this.#offers) {
      if (this.#picks.has(id) || tick < offer.endsAtTick) {
        continue;
      }
      const rng = mulberry32(hashSeed(this.#matchSeed, this.#round, id, "autopick"));
      const index = Math.min(offer.offers.length - 1, Math.floor(rng() * offer.offers.length));
      this.#picks.set(id, offer.offers[index]!);
    }
  }

  /** Every offered player has a recorded pick (manual or auto) — fed into
   *  `match/phase.ts`'s `draftComplete` input via `MatchDirector.tick`. */
  isComplete(): boolean {
    return this.#picks.size >= this.#offers.size;
  }

  /** A player's seat is gone entirely (not just spectating) — drops their
   *  offer/pick so a match that continues with fewer players doesn't wait
   *  forever on a pick that will never come. A no-op consequence either way
   *  for a 2-player match, since `match/phase.ts`'s own `MIN_PLAYERS` check
   *  already aborts `Draft` back to `Waiting` before `draftComplete` would
   *  even matter — this only changes behavior for 3+ player matches. */
  removePlayer(id: PlayerId): void {
    this.#offers.delete(id);
    this.#picks.delete(id);
    this.#applied.delete(id);
  }

  /** Returns every pick resolved since the last `drainPicks()` call (manual
   *  or auto), marking them applied — `MatchRoom` calls this once per tick
   *  and folds the result into `SimState.powerups`, so each pick is applied
   *  to the sim exactly once even though `isComplete()`/`#picks` itself
   *  isn't cleared until the next `startRound`. */
  drainPicks(): ReadonlyMap<PlayerId, PowerUpId> {
    const fresh = new Map<PlayerId, PowerUpId>();
    for (const [id, powerUpId] of this.#picks) {
      if (!this.#applied.has(id)) {
        fresh.set(id, powerUpId);
        this.#applied.add(id);
      }
    }
    return fresh;
  }
}
