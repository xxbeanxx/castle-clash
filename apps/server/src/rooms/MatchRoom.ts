import {
  COSMETIC_SLOTS,
  createHazardState,
  createSimPlayer,
  getArena,
  hashSeed,
  HazardState,
  isArenaId,
  isDraftPick,
  isInputFrame,
  MatchState,
  MAX_PLAYERS,
  MESSAGE_TYPES,
  PATCH_RATE,
  playerId,
  PlayerState,
  projectToSchema,
  randomArenaId,
  resolveCosmeticSelection,
  step as simulationStep,
  TICK_RATE,
  type ArenaId,
  type InputFrame,
  type PlayerId,
  type SimState,
  type WeaponId,
} from "@castle-clash/shared";
import { type AuthContext, type Client, CloseCode, matchMaker, Room } from "colyseus";
import type pino from "pino";
import {
  createDefaultTokenVerifier,
  type TokenVerifier,
  type VerifiedUser,
} from "../auth/verifyToken.js";
import { envNumber } from "../env.js";
import { logger } from "../logger.js";
import { DraftService, type DraftRoundPlayer } from "../match/DraftService.js";
import { MatchDirector, type MatchResult } from "../match/MatchDirector.js";
import { evaluateAndGrantUnlocks } from "../match/unlocks.js";
import {
  inputDropsTotal,
  removeRoomPhase,
  setRoomPhase,
  tickDurationSeconds,
} from "../observability/metrics.js";
import { createDefaultPlayerRepository } from "../persistence/createPlayerRepository.js";
import type { MatchResultRecord, PlayerRepository } from "../persistence/PlayerRepository.js";
import { enqueueRecordMatch } from "../persistence/RecordMatchQueue.js";
import { FixedWindowRateLimiter } from "../rateLimit.js";
import { isDraining, trackPendingWrite } from "../shutdown.js";
import { InputQueue } from "./InputQueue.js";
import { serverVersion } from "../serverVersion.js";
import { generateRoomCode } from "./roomCode.js";
import { IntervalTickDriver, type TickDriver } from "./TickDriver.js";

/** Generous headroom over one input per tick, so a legitimate client that
 *  briefly resends (e.g. after a reconnect) isn't punished, while a flood is. */
const MAX_MESSAGES_PER_SECOND = TICK_RATE * 2;
/** A pick happens once per round at most for a legitimate client — this is
 *  headroom for retries/misclicks, not a budget anyone should ever need to
 *  spend fast. Deliberately its own, much smaller bucket (see
 *  `#draftRateLimiter`): sharing `MAX_MESSAGES_PER_SECOND`'s
 *  bucket with `input` would let a tick's worth of combat-input spam starve
 *  a `draft:pick` sent in the same real-time window, dropping a legitimate
 *  pick with no draft-side validation ever running on it. */
const MAX_DRAFT_PICKS_PER_SECOND = 5;
const RATE_LIMIT_WINDOW_MS = 1000;

/** Plan Phase 10 step 1's "room-level input abuse kick" — a connection with
 *  this many CONSECUTIVE rate-limited messages (any accepted message resets
 *  the streak) is disconnected outright rather than perpetually throttled.
 *  A legitimate client stays far under `MAX_MESSAGES_PER_SECOND` and never
 *  builds a streak; a flooder exhausts its window and every further message
 *  in it extends one. */
const ABUSE_KICK_THRESHOLD = 30;
/** Application-range WebSocket close code (4000-4999) for the kick above. */
const ABUSE_KICK_CLOSE_CODE = 4008;

/** Plan Phase 10 step 1's "join rate limit per ... user" — module-scoped
 *  (not per-`MatchRoom` instance) because a malicious client repeatedly
 *  joining/leaving DIFFERENT rooms would otherwise reset its budget on
 *  every attempt; this is the one guardrail that has to see across every
 *  room this process ever creates. Generous: a legitimate client calls
 *  `onJoin` once per real join, ever. */
const MAX_JOINS_PER_USER_PER_MINUTE = 10;
const JOIN_RATE_LIMIT_WINDOW_MS = 60_000;
const userJoinRateLimiter = new FixedWindowRateLimiter(
  MAX_JOINS_PER_USER_PER_MINUTE,
  JOIN_RATE_LIMIT_WINDOW_MS,
);

/** Plan Phase 10 step 1's "max rooms per process" — checked in `onCreate`
 *  against `matchMaker.stats.local.roomCount`. The load-test budget (plan
 *  step 5) targets 20 concurrent 6-player rooms on one instance; this is
 *  deliberately well above that so it only ever fires as a genuine runaway-
 *  creation guardrail, not a normal-operation ceiling. */
function maxRoomsPerProcess(): number {
  return envNumber("MAX_ROOMS_PER_PROCESS", 500);
}

/** How long a dropped connection's seat stays reserved before the player is
 *  finally removed from the match (plan Phase 5 step 3). */
const RECONNECTION_WINDOW_SECONDS = 20;

type MatchDirectorEvents = ReturnType<MatchDirector["tick"]>["events"];

export type MatchMode = "quick" | "private";

export interface MatchRoomOptions {
  tickDriver?: TickDriver;
  /** Test/DI seam, same pattern as `tickDriver` — a real client never sends
   *  this (it isn't in `JoinIntent`'s shape), only `colyseus.createRoom()`
   *  (server-side, not over the wire) can set it. Defaults to
   *  `createDefaultPlayerRepository()`'s real Supabase-or-in-memory choice. */
  playerRepository?: PlayerRepository;
  /** Test/DI seam for `enqueueRecordMatch`'s retry backoff — same pattern
   *  as `tickDriver`/`playerRepository`. A test that makes
   *  `PlayerRepository.recordMatch` always fail (`MatchRoom.auth.test.ts`)
   *  would otherwise wait out several real seconds of exponential backoff
   *  to observe it give up. Defaults to a real `setTimeout`-based delay. */
  recordMatchDelay?: (ms: number) => Promise<void>;
  mode?: MatchMode;
  /** A private room's join code. Only meaningful together with `mode:
   *  "private"` — supplying it when *joining* an existing private room is
   *  what `filterBy(["mode", "code"])` matches against; it's ignored (the
   *  server always generates its own) when *creating* one. */
  code?: string;
  /** Picks this match's arena (plan Phase 6 step 4's `fixed` config) —
   *  invalid or omitted falls back to a random pick among `ALL_ARENAS`
   *  (`random`). Set once at `onCreate` and never changes for the rest of
   *  the match; a `"vote"` config and per-round rotation are both out of
   *  scope for this phase (see `docs/research/phase6-arena-scope-
   *  deviations.md`). */
  arenaId?: string;
}

export interface MatchRoomMetadata {
  mode: MatchMode;
  code?: string;
}

export class MatchRoom extends Room<{ state: MatchState; metadata: MatchRoomMetadata }> {
  /** Overridable so tests can stub out real JWT verification (see
   *  `MatchRoom.auth.test.ts`) without a real Supabase project — the same
   *  reason `TickDriver` is injected via options rather than hard-coded.
   *  Unlike `tickDriver`, this can't be an `onCreate` option: `onAuth` is
   *  `static` and runs before any room instance (or its options) exists. */
  static verifyToken: TokenVerifier = createDefaultTokenVerifier();

  /** Colyseus calls this — not the instance `onAuth` also declared on
   *  `Room` — before a room instance is even selected for a `joinOrCreate`
   *  (plan Phase 8 step 5). Rejects (throws) on a missing or invalid token;
   *  `MatchMaker` turns that rejection into the client's join failing. The
   *  resolved `VerifiedUser` becomes `client.auth` in `onJoin` below. */
  static async onAuth(
    token: string,
    _options: unknown,
    _context: AuthContext,
  ): Promise<VerifiedUser> {
    return MatchRoom.verifyToken(token);
  }

  #tickDriver!: TickDriver;
  #playerRepository!: PlayerRepository;
  #recordMatchDelay!: (ms: number) => Promise<void>;
  #matchId!: string;
  #startedAt!: Date;
  readonly #inputQueue = new InputQueue();
  readonly #inputRateLimiter = new FixedWindowRateLimiter(
    MAX_MESSAGES_PER_SECOND,
    RATE_LIMIT_WINDOW_MS,
  );
  /** Its own, much smaller bucket — sharing `#inputRateLimiter`'s would let
   *  a tick's worth of combat-input spam starve a `draft:pick` sent in the
   *  same real-time window, dropping a legitimate pick with no draft-side
   *  validation ever running on it. */
  readonly #draftRateLimiter = new FixedWindowRateLimiter(
    MAX_DRAFT_PICKS_PER_SECOND,
    RATE_LIMIT_WINDOW_MS,
  );
  /** Consecutive rate-limit hits per `client.sessionId`, across BOTH
   *  buckets above — incremented on every drop, reset to 0 the moment a
   *  message from that session is accepted again. Feeds the
   *  `ABUSE_KICK_THRESHOLD` disconnect in `#onInput`/`#onDraftPick`. */
  readonly #violationStreaks = new Map<string, number>();
  readonly #director = new MatchDirector();
  /** Session ids that joined mid-`RoundActive` and are watching, not
   *  playing, until the next round starts (plan step 3: "late joiners wait
   *  or spectate"). Never in `#sim.players`. */
  readonly #spectatorIds = new Set<string>();
  /** The authenticated Supabase user id currently holding each seat —
   *  checked in `onJoin` so "the same user can't hold two seats" (plan step
   *  5) survives a reconnect window: `onDrop` deliberately does NOT clear
   *  this (the seat stays reserved), only `onLeave` (a truly final
   *  departure) does. */
  readonly #sessionIdByUserId = new Map<string, string>();
  /** Append-only for the room's whole lifetime (never cleared on leave,
   *  unlike `#sessionIdByUserId` above) — `MatchDirector`'s per-player
   *  stats survive a mid-match disconnect, so building a `MatchResultRecord`
   *  at `MatchOver` needs every participant's userId, including ones who
   *  already left. */
  readonly #userIdByPlayerId = new Map<PlayerId, string>();
  /** Same append-only-for-the-match-lifetime reasoning as
   *  `#userIdByPlayerId` above, set alongside it in `onJoin` — `#sim.
   *  players[id].weapon` is deleted on `onLeave` and a promoted spectator's
   *  `SimPlayer` never carried a weapon at all before Phase 9 (`
   *  #promoteSpectators` didn't know a loadout existed), so this is the one
   *  place `#buildMatchResultRecord` can reliably read a participant's
   *  weapon back from at `MatchOver`, regardless of when they left or
   *  whether they spent part of the match spectating. */
  readonly #weaponByPlayerId = new Map<PlayerId, WeaponId>();
  /** Plan Phase 10 step 1: "Structured logs with pino (roomId, matchId,
   *  userId)." Bound with `roomId`/`matchId` once both are known (right
   *  after `#matchId` is generated in `onCreate`) so every log line this
   *  room ever writes carries both without repeating them at each call
   *  site; a per-connection call adds `userId`/`sessionId` on top via
   *  `.child(...)` again where relevant. */
  #logger!: pino.Logger;
  #sim!: SimState;
  #draftService!: DraftService;
  /** Set from the most recent `roundEnd` event, read back when the
   *  following `draftStart` fires (`ROUND_OVER_TICKS` ticks later) to
   *  compute each player's `DraftRoundPlayer.placement` — see
   *  `DraftService`'s doc comment on the 2-tier simplification this implies
   *  for 3+ player matches. */
  #lastRoundWinner: PlayerId | null = null;
  /** Set by `onBeforeShutdown()` for a room whose match is mid-flight. */
  #disconnectWhenMatchOver = false;

  async onCreate(options: MatchRoomOptions = {}): Promise<void> {
    // Plan Phase 10 step 1: "on SIGTERM the server stops accepting new
    // rooms." Thrown before any state/tick-driver setup, so a draining
    // process never leaves a half-initialized room behind — the matchmaker
    // turns this into the join failing, the same way an `onAuth` rejection
    // already does.
    if (isDraining()) {
      throw new Error("server is draining — not accepting new rooms");
    }
    // Colyseus increments `roomCount` only AFTER `onCreate` resolves (checked
    // in `MatchMaker.handleCreateRoom`), so it does not yet include this room.
    if (matchMaker.stats.local.roomCount >= maxRoomsPerProcess()) {
      throw new Error("server is at its room capacity — not accepting new rooms");
    }
    // Found by Phase 10's load test: nothing ever set this, so Colyseus's
    // default (unlimited) let quick play stuff every waiting client into ONE
    // room — 24 bots produced a single 24-player match, not four 6-player ones.
    this.maxClients = MAX_PLAYERS;
    this.setState(new MatchState());
    this.setPatchRate(1000 / PATCH_RATE);
    this.#playerRepository = options.playerRepository ?? createDefaultPlayerRepository();
    this.#recordMatchDelay =
      options.recordMatchDelay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    // Generated once here, not when the match ends, so a `recordMatch` retry
    // after a transient failure always resends the exact same id — that's
    // what makes `record_match_result()`'s conflict-on-`matches.id` check an
    // actual idempotency guarantee rather than a coincidence.
    this.#matchId = crypto.randomUUID();
    this.#startedAt = new Date();
    this.#logger = logger.child({ roomId: this.roomId, matchId: this.#matchId });

    const arenaId: ArenaId =
      options.arenaId && isArenaId(options.arenaId) ? options.arenaId : randomArenaId();
    const arena = getArena(arenaId);
    this.state.arenaId = arena.id;
    // Seed one empty HazardState entry per hazard def — id/kind only.
    // `projectToSchema()` below fills in the dynamic fields (active/hp/
    // phase/timer); it never creates entries itself (same contract as
    // players), so this loop owns creation the same way `onJoin` owns
    // creating a player's PlayerState.
    for (const hazard of arena.hazards) {
      const hazardState = new HazardState();
      hazardState.id = hazard.id;
      hazardState.kind = hazard.kind;
      this.state.hazards.set(hazard.id, hazardState);
    }
    this.#sim = {
      tick: 0,
      players: {},
      arena,
      rngSeed: hashSeed(this.roomId),
      hazards: createHazardState(arena.hazards),
    };
    this.#draftService = new DraftService(hashSeed(this.roomId));
    // `projectToSchema` is ADR 0001's only place sim state crosses into
    // schema — routing the initial sync through it too (rather than
    // hand-copying HazardRuntimeState's fields here) means the field list
    // only exists in one place.
    projectToSchema(this.#sim, this.state, {});

    const mode: MatchMode = options.mode ?? "quick";
    await this.setMetadata(mode === "private" ? { mode, code: generateRoomCode() } : { mode });

    this.onMessage(MESSAGE_TYPES.INPUT, (client, payload: unknown) => {
      this.#onInput(client, payload);
    });
    this.onMessage(MESSAGE_TYPES.DRAFT_PICK, (client, payload: unknown) => {
      this.#onDraftPick(client, payload);
    });

    this.#tickDriver = options.tickDriver ?? new IntervalTickDriver(this, TICK_RATE);
    this.#tickDriver.start(() => this.#tick());
  }

  async onJoin(client: Client): Promise<void> {
    // `client.auth` is whatever `MatchRoom.onAuth` (static, above) resolved
    // to for this token — always set by the time `onJoin` runs, since
    // `onAuth` throwing rejects the join before `onJoin` is ever called.
    const auth = client.auth as VerifiedUser;
    if (!userJoinRateLimiter.consume(auth.userId)) {
      throw new Error(`user ${auth.userId} is joining too frequently`);
    }
    if (this.#sessionIdByUserId.has(auth.userId)) {
      // Plan step 5: "the same user can't hold two seats." Throwing here
      // (rather than silently ignoring the join) is what makes the second
      // connection attempt fail instead of quietly succeeding with no body.
      throw new Error(`user ${auth.userId} is already connected to this match`);
    }
    this.#sessionIdByUserId.set(auth.userId, client.sessionId);
    this.#userIdByPlayerId.set(playerId(client.sessionId), auth.userId);

    const [loadout, owned] = await Promise.all([
      this.#playerRepository.getLoadout(auth.userId),
      this.#playerRepository.getUnlocks(auth.userId),
    ]);
    const id = playerId(client.sessionId);
    this.#weaponByPlayerId.set(id, loadout.weapon);

    const spawnIndex = this.state.players.size % this.#sim.arena.spawns.length;
    const spawn = this.#sim.arena.spawns[spawnIndex]!;

    const player = new PlayerState();
    player.id = client.sessionId;
    player.x = spawn.x;
    player.y = spawn.y;
    player.colorSeed = hashSeed(client.sessionId);
    // Plan Phase 9 step 3: "Client-supplied cosmetics are never trusted" —
    // re-validates the persisted selection against the player's OWN
    // `player_unlocks` (just fetched above) and the catalog, not against
    // whatever `player_loadouts` happens to contain. An id that's unowned
    // (stale RLS bypass, a removed catalog item) silently falls back to
    // that slot's default rather than reaching any connected client.
    player.cosmetics.helmetId = resolveCosmeticSelection(
      COSMETIC_SLOTS.HELMET,
      loadout.helmetId,
      owned,
    );
    player.cosmetics.capeId = resolveCosmeticSelection(COSMETIC_SLOTS.CAPE, loadout.capeId, owned);
    player.cosmetics.weaponStyleId = resolveCosmeticSelection(
      COSMETIC_SLOTS.WEAPON_STYLE,
      loadout.weaponStyleId,
      owned,
    );
    player.cosmetics.tintPrimary = loadout.tintPrimary;
    player.cosmetics.tintSecondary = loadout.tintSecondary;

    // A room mid-round doesn't hand a brand-new player a body until the next
    // round starts (plan step 3) — they watch instead. Deliberately NOT
    // implemented via the plan's literal "rooms lock during RoundActive":
    // Colyseus's `room.lock()` rejects joinById/joinOrCreate outright
    // (MATCHMAKE_INVALID_ROOM_ID) — a genuinely locked room can't accept a
    // spectator either, since it can't accept anyone. `filterBy(["mode",
    // "code"])` already keeps quick-play matchmaking from routing new
    // randoms into a room mid-match (its metadata still matches, but a
    // locked room would be excluded from the query the same way — the
    // difference only matters for someone joining a specific roomId/code
    // directly, which is exactly the "or spectate" case this achieves
    // instead).
    const spectating = this.#director.phase.phase === "RoundActive";
    player.spectator = spectating;
    player.alive = !spectating;
    this.state.players.set(client.sessionId, player);

    if (spectating) {
      this.#spectatorIds.add(client.sessionId);
    } else {
      // Plan step 5/Phase 9 step 3: "loads each player's persisted
      // loadout" — `weapon` changes gameplay (`MatchDirector.
      // respawnPlayers` threads it across rounds); `helmetId`/`capeId`/
      // `weaponStyleId`/tints are cosmetic-only and render as indicator
      // rects, not real sprite art (see `docs/research/
      // phase9-cosmetics-rendering-deviation.md`) — already synced onto
      // `player.cosmetics` above, independent of whether this player has a
      // body yet.
      this.#sim = {
        ...this.#sim,
        players: { ...this.#sim.players, [id]: createSimPlayer(spawn, loadout.weapon) },
      };
      this.#director.addPlayer(id);
    }

    if (this.metadata.mode === "private" && this.metadata.code) {
      client.send(MESSAGE_TYPES.MATCH_CODE, this.metadata.code);
    }
  }

  /** An unconsented drop (plan step 3): keep the seat open for
   *  `RECONNECTION_WINDOW_SECONDS`, but a drop mid-round still counts as an
   *  elimination for the *current* round — the reconnecting player simply
   *  plays again from the next round on. */
  onDrop(client: Client): void {
    this.#eliminateIfRoundActive(playerId(client.sessionId));
    this.allowReconnection(client, RECONNECTION_WINDOW_SECONDS).catch(() => {
      // Reconnection window expired or was rejected — onLeave() below still
      // runs and does the real cleanup either way.
    });
  }

  onLeave(client: Client): void {
    const id = playerId(client.sessionId);
    // A consented mid-round leave (no prior onDrop) is still an elimination
    // — a no-op if onDrop already handled this exact departure.
    this.#eliminateIfRoundActive(id);
    this.state.players.delete(client.sessionId);
    const remainingPlayers = { ...this.#sim.players };
    delete remainingPlayers[id];
    this.#sim = { ...this.#sim, players: remainingPlayers };
    this.#inputQueue.removePlayer(client.sessionId);
    this.#inputRateLimiter.delete(client.sessionId);
    this.#draftRateLimiter.delete(client.sessionId);
    this.#violationStreaks.delete(client.sessionId);
    this.#spectatorIds.delete(client.sessionId);
    this.#director.removePlayer(id);
    this.#draftService.removePlayer(id);
    // Deliberately only here, not `onDrop`: a dropped-but-reconnectable seat
    // must still count as "this user is connected" so a second join attempt
    // during the reconnection window is rejected (plan step 5). Note this
    // does NOT touch `#userIdByPlayerId` — that map has to survive this
    // player's whole departure so `#buildMatchResultRecord` can still name
    // them if the match ends after they've left.
    const auth = client.auth as VerifiedUser | undefined;
    if (auth) {
      this.#sessionIdByUserId.delete(auth.userId);
    }
  }

  #eliminateIfRoundActive(id: PlayerId): void {
    if (this.#director.phase.phase !== "RoundActive") {
      return;
    }
    const event = this.#director.eliminateByDisconnect(id, this.#sim, this.#sim.tick);
    if (event) {
      this.broadcast(MESSAGE_TYPES.FX, [event]);
    }
  }

  onDispose(): void {
    this.#tickDriver.stop();
    removeRoomPhase(this.roomId);
  }

  #onInput(client: Client, payload: unknown): void {
    if (!this.#acceptWithinRateLimit(client, this.#inputRateLimiter, "input")) {
      return;
    }
    if (!isInputFrame(payload)) {
      inputDropsTotal.labels("malformed").inc();
      this.#logger.warn({ sessionId: client.sessionId }, "malformed input, dropping");
      return;
    }
    this.#inputQueue.push(client.sessionId, payload);
  }

  #onDraftPick(client: Client, payload: unknown): void {
    if (!this.#acceptWithinRateLimit(client, this.#draftRateLimiter, "draft pick")) {
      return;
    }
    if (!isDraftPick(payload)) {
      inputDropsTotal.labels("malformed").inc();
      this.#logger.warn({ sessionId: client.sessionId }, "malformed draft pick, dropping");
      return;
    }
    this.#draftService.pick(playerId(client.sessionId), payload.id);
  }

  /** Two independent limiters (input vs draft pick) so a burst on one
   *  message type can never starve the other's budget for the same
   *  connection; both feed ONE per-session `#violationStreaks` count, since
   *  "abuse" is a property of the connection, not of a message type. A
   *  dropped message extends the streak and, at `ABUSE_KICK_THRESHOLD`,
   *  disconnects the client (plan Phase 10 step 1's "room-level input abuse
   *  kick"); an accepted one resets it. */
  #acceptWithinRateLimit(client: Client, limiter: FixedWindowRateLimiter, label: string): boolean {
    if (limiter.consume(client.sessionId)) {
      this.#violationStreaks.delete(client.sessionId);
      return true;
    }

    inputDropsTotal.labels("rate_limited").inc();
    const streak = (this.#violationStreaks.get(client.sessionId) ?? 0) + 1;
    this.#violationStreaks.set(client.sessionId, streak);
    this.#logger.warn({ sessionId: client.sessionId, streak }, `rate-limited ${label}, dropping`);

    if (streak >= ABUSE_KICK_THRESHOLD) {
      this.#logger.warn({ sessionId: client.sessionId }, "kicking client for input abuse");
      this.#violationStreaks.delete(client.sessionId);
      client.leave(ABUSE_KICK_CLOSE_CODE, "input abuse");
    }
    return false;
  }

  /** Plan Phase 10 step 1's tick-duration histogram — a thin timing wrapper
   *  around `#tickInner()` rather than instrumenting inline, so the tick
   *  logic itself doesn't have to thread a start-time variable through
   *  every early return it doesn't have (it has none today, but this keeps
   *  it that way). */
  #tick(): void {
    const endTimer = tickDurationSeconds.startTimer();
    this.#tickInner();
    endTimer();
  }

  #tickInner(): void {
    // Applies whatever `DraftService` resolved (manual or auto-picked) as of
    // the END of the PREVIOUS tick — one tick behind `#draftService.tick()`
    // below on purpose, the same "read prev, compute next" convention
    // `GameSimulation.step` itself follows for everything else (hazards,
    // physics). Applying picks before that tick's `simulationStep` runs
    // means a pick resolved last tick is visible to this tick's derived
    // stats immediately, not delayed an extra tick.
    this.#applyDraftPicks();

    const inputs: Record<string, InputFrame> = {};
    const lastProcessedSeq: Record<string, number> = {};
    const connectedIds = Object.keys(this.#sim.players) as PlayerId[];

    for (const sessionId of connectedIds) {
      const frame = this.#inputQueue.consume(sessionId);
      inputs[sessionId] = frame;
      lastProcessedSeq[sessionId] = frame.seq;
    }

    const prevSim = this.#sim;
    const stepResult = simulationStep(prevSim, inputs);
    // Auto-pick timeouts against THIS tick's absolute tick (`stepResult.
    // state.tick`, i.e. `nextTick`) — the same tick value `match/phase.ts`'s
    // own `DRAFT_TICKS` hard fallback compares `ticksInPhase` against below
    // (via `director.tick`'s `nextSim.tick`). Calling this with any other
    // tick value would let the two fallbacks drift out of sync, so a timed-
    // out draft could reach `Countdown` with a pick never actually resolved.
    this.#draftService.tick(stepResult.state.tick);
    const draftComplete = this.#draftService.isComplete();
    const directorResult = this.#director.tick(
      prevSim,
      stepResult.state,
      stepResult.events,
      connectedIds,
      draftComplete,
    );
    this.#sim = this.#promoteSpectators(directorResult.state, directorResult.events);

    projectToSchema(this.#sim, this.state, lastProcessedSeq);
    this.#syncMatchFlow();

    for (const event of directorResult.events) {
      if (event.type === "roundEnd") {
        this.#lastRoundWinner = event.winner;
      }
      if (event.type === "draftStart") {
        this.#startDraft(event.round);
      }
    }

    // Transient combat/movement feedback (hit, blocked, guardBreak, ko,
    // whiff, jump, land, eliminated) — never stored in schema (plan Phase 4
    // step 4), so it's only sent when there's something to say.
    if (stepResult.events.length > 0) {
      this.broadcast(MESSAGE_TYPES.FX, stepResult.events);
    }
    if (directorResult.result) {
      this.broadcast(MESSAGE_TYPES.MATCH_RESULT, directorResult.result);
      const record = this.#buildMatchResultRecord(directorResult.result);
      // Fire-and-forget on purpose (plan step 5): `enqueueRecordMatch`
      // retries with backoff internally and never throws, so this never
      // delays or crashes the room's own tick/dispose regardless of
      // whether the repository write succeeds. Chained, not awaited: unlock
      // evaluation (plan Phase 9 step 3) only makes sense once `recordMatch`
      // actually landed (it reads the stats that write just updated) — a
      // permanently-failed record is still fire-and-forget, just with
      // nothing further to chain.
      const postMatchWrites = enqueueRecordMatch(
        this.#playerRepository,
        record,
        this.#recordMatchDelay,
      )
        .then((succeeded) => {
          if (!succeeded) {
            return;
          }
          return evaluateAndGrantUnlocks(
            this.#playerRepository,
            record.participants.map((participant) => participant.playerId),
            (userId, newlyUnlocked) => {
              const sessionId = this.#sessionIdByUserId.get(userId);
              const client = sessionId ? this.clients.getById(sessionId) : undefined;
              client?.send(MESSAGE_TYPES.PROFILE_UNLOCKS, newlyUnlocked);
            },
          );
        })
        .catch((error: unknown) => {
          this.#logger.error({ err: error }, "unlock evaluation failed");
        })
        .finally(() => {
          // Draining (`onBeforeShutdown`): this match was allowed to run to
          // completion, and its result is now recorded — release the room so
          // the process can exit. Deliberately AFTER `recordMatch`, never
          // before: plan Phase 10's shutdown gate says an in-progress match
          // "completes and calls `recordMatch` before exit."
          if (this.#disconnectWhenMatchOver) {
            this.#releaseForShutdown();
          }
        });
      // `drain()` awaits this before `exit` — including for a room that was
      // ALREADY `MatchOver` when SIGTERM arrived (released at once by
      // `onBeforeShutdown`) whose write may still be retrying with backoff.
      trackPendingWrite(postMatchWrites);
    }
  }

  #releaseForShutdown(): void {
    this.disconnect(CloseCode.SERVER_SHUTDOWN).catch((error: unknown) => {
      this.#logger.warn({ err: error }, "disconnect during shutdown failed");
    });
  }

  /** Plan Phase 10 step 1: "lets running matches finish." Colyseus's default
   *  `Room.onBeforeShutdown()` disconnects every client immediately —
   *  verified in `@colyseus/core`'s `Room.mjs`, and observed live: a SIGTERM
   *  mid-match exited in ~2 seconds. Overridden so a room with a match in
   *  progress keeps running until `MatchOver` (then releases itself, see the
   *  `.finally` above), while a room with no match to protect — still
   *  `Waiting` for players, or already `MatchOver` — goes at once. */
  onBeforeShutdown(): void {
    const phase = this.#director.phase.phase;
    // Only the drain path (`shutdown.ts`, which bounds the wait with
    // `DRAIN_TIMEOUT`) may hold a room open. Any other caller of Colyseus's
    // shutdown — notably `@colyseus/testing`'s `shutdown()` — has no timeout,
    // so a room left mid-match would hang it forever.
    if (!isDraining() || phase === "Waiting" || phase === "MatchOver") {
      this.#releaseForShutdown();
      return;
    }
    this.#disconnectWhenMatchOver = true;
  }

  /** Generates and privately sends each active player's draft offer (plan
   *  Phase 7 step 4) the tick `match/phase.ts`'s `draftStart` event fires.
   *  A player who joins mid-Draft (rather than being one of the round's
   *  existing active players) never gets an offer this round — `onJoin`
   *  only hands out a body outside `RoundActive`, so this is a real if rare
   *  case, and simplest to just let them sit out the draft they arrived
   *  mid-way through rather than reopen an offer round already in flight. */
  #startDraft(round: number): void {
    const connectedIds = Object.keys(this.#sim.players) as PlayerId[];
    const players: DraftRoundPlayer[] = connectedIds.map((id) => ({
      id,
      placement: id === this.#lastRoundWinner ? 1 : 2,
      ownedStacks: this.#sim.players[id]?.powerups ?? {},
    }));
    const offers = this.#draftService.startRound(round, this.#sim.tick, players);
    for (const [id, offer] of offers) {
      this.clients.getById(id)?.send(MESSAGE_TYPES.DRAFT_OFFER, {
        offers: offer.offers,
        endsAtTick: offer.endsAtTick,
      });
    }
  }

  /** Folds every pick `DraftService` has resolved (manual or auto-picked on
   *  timeout) since the last tick into `SimState.powerups` — exactly once
   *  per pick, since `DraftService.drainPicks()` only ever returns a given
   *  player's pick the first time it's called after that pick resolves. */
  #applyDraftPicks(): void {
    const picks = this.#draftService.drainPicks();
    if (picks.size === 0) {
      return;
    }
    let players = this.#sim.players;
    for (const [id, powerUpId] of picks) {
      const player = players[id];
      if (!player) {
        continue;
      }
      const stacks = { ...(player.powerups ?? {}) };
      stacks[powerUpId] = (stacks[powerUpId] ?? 0) + 1;
      players = { ...players, [id]: { ...player, powerups: stacks } };
    }
    this.#sim = { ...this.#sim, players };
  }

  /** Hands every waiting spectator a body the tick a new round starts. */
  #promoteSpectators(sim: SimState, events: MatchDirectorEvents): SimState {
    if (this.#spectatorIds.size === 0 || !events.some((event) => event.type === "roundStart")) {
      return sim;
    }

    let players = sim.players;
    for (const sessionId of this.#spectatorIds) {
      const id = playerId(sessionId);
      const spawnIndex = Object.keys(players).length % sim.arena.spawns.length;
      // `#weaponByPlayerId` was set at this player's own `onJoin`, before
      // they ever became a spectator — a promoted spectator gets their own
      // loadout weapon, not `createSimPlayer`'s `DEFAULT_WEAPON` fallback.
      players = {
        ...players,
        [id]: createSimPlayer(sim.arena.spawns[spawnIndex]!, this.#weaponByPlayerId.get(id)),
      };
      this.#director.addPlayer(id);
      const schemaPlayer = this.state.players.get(sessionId);
      if (schemaPlayer) {
        schemaPlayer.spectator = false;
      }
    }
    this.#spectatorIds.clear();
    return { ...sim, players };
  }

  /** `projectToSchema()` (shared) is the only place `SimState` crosses into
   *  schema (ADR 0001) — this is deliberately a separate, MatchRoom-local
   *  sync instead of extending that function's signature, since
   *  `MatchPhaseState`/spectator bookkeeping is server-only match-flow
   *  state, not part of the isomorphic sim `projectToSchema` projects. */
  #syncMatchFlow(): void {
    const phase = this.#director.phase;
    this.state.phase = phase.phase;
    setRoomPhase(this.roomId, phase.phase);
    this.state.round = phase.round;
    this.state.phaseEndsAtTick = phase.phaseEndsAtTick ?? -1;

    this.state.players.forEach((schemaPlayer, sessionId) => {
      const id = playerId(sessionId);
      schemaPlayer.spectator = this.#spectatorIds.has(sessionId);
      schemaPlayer.alive = schemaPlayer.spectator ? false : this.#director.isAlive(id);
      schemaPlayer.roundsWon = phase.roundsWon[id] ?? 0;
    });
  }

  /** Every `PlayerId` in `result.stats` has a `#userIdByPlayerId` entry by
   *  construction — it's set in `onJoin` for every seat that ever existed,
   *  including ones that later left, and `MatchDirector` never invents a
   *  `PlayerId` that didn't come through `onJoin`. A missing entry here
   *  would mean that invariant broke, not a normal runtime case, hence the
   *  throw rather than a silent fallback into `record_match_result()`'s
   *  `uuid` column. */
  #requireUserId(id: PlayerId): string {
    const userId = this.#userIdByPlayerId.get(id);
    if (!userId) {
      throw new Error(`no known userId for player ${id} — onJoin invariant violated`);
    }
    return userId;
  }

  /** Same invariant and same reasoning as `#requireUserId` above —
   *  `#weaponByPlayerId` is set unconditionally in `onJoin`, right
   *  alongside `#userIdByPlayerId`, so every `PlayerId` in `result.stats`
   *  has an entry here too. */
  #requireWeapon(id: PlayerId): WeaponId {
    const weapon = this.#weaponByPlayerId.get(id);
    if (!weapon) {
      throw new Error(`no known weapon for player ${id} — onJoin invariant violated`);
    }
    return weapon;
  }

  #buildMatchResultRecord(result: MatchResult): MatchResultRecord {
    return {
      matchId: this.#matchId,
      arenaIds: [this.#sim.arena.id],
      mode: this.metadata.mode,
      startedAt: this.#startedAt,
      endedAt: new Date(),
      winnerId: result.winner ? this.#requireUserId(result.winner) : null,
      serverVersion: serverVersion(),
      participants: (Object.keys(result.stats) as PlayerId[]).map((id) => {
        const stats = result.stats[id]!;
        const powerups = this.#sim.players[id]?.powerups ?? {};
        return {
          playerId: this.#requireUserId(id),
          placement: id === result.winner ? 1 : 2,
          roundsWon: stats.roundsWon,
          eliminations: stats.eliminations,
          deaths: stats.deaths,
          damageDealt: stats.damageDealt,
          powerups: Object.entries(powerups).flatMap(
            ([powerUpId, count]) => Array(count).fill(powerUpId) as string[],
          ),
          weapon: this.#requireWeapon(id),
        };
      }),
    };
  }
}
