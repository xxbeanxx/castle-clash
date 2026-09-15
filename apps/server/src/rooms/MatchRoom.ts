import {
  createSimPlayer,
  hashSeed,
  isInputFrame,
  MatchState,
  MESSAGE_TYPES,
  PATCH_RATE,
  playerId,
  PlayerState,
  projectToSchema,
  step as simulationStep,
  TESTBED_ARENA,
  TICK_RATE,
  type InputFrame,
  type PlayerId,
  type SimState,
} from "@castle-clash/shared";
import { type Client, Room } from "colyseus";
import { MatchDirector } from "../match/MatchDirector.js";
import { InputQueue } from "./InputQueue.js";
import { generateRoomCode } from "./roomCode.js";
import { IntervalTickDriver, type TickDriver } from "./TickDriver.js";

/** Generous headroom over one input per tick, so a legitimate client that
 *  briefly resends (e.g. after a reconnect) isn't punished, while a flood is. */
const MAX_MESSAGES_PER_SECOND = TICK_RATE * 2;
const RATE_LIMIT_WINDOW_MS = 1000;

/** How long a dropped connection's seat stays reserved before the player is
 *  finally removed from the match (plan Phase 5 step 3). */
const RECONNECTION_WINDOW_SECONDS = 20;

export type MatchMode = "quick" | "private";

export interface MatchRoomOptions {
  tickDriver?: TickDriver;
  mode?: MatchMode;
  /** A private room's join code. Only meaningful together with `mode:
   *  "private"` — supplying it when *joining* an existing private room is
   *  what `filterBy(["mode", "code"])` matches against; it's ignored (the
   *  server always generates its own) when *creating* one. */
  code?: string;
}

export interface MatchRoomMetadata {
  mode: MatchMode;
  code?: string;
}

export class MatchRoom extends Room<{ state: MatchState; metadata: MatchRoomMetadata }> {
  #tickDriver!: TickDriver;
  readonly #inputQueue = new InputQueue();
  readonly #messageWindows = new Map<string, { windowStartMs: number; count: number }>();
  readonly #director = new MatchDirector();
  /** Session ids that joined mid-`RoundActive` and are watching, not
   *  playing, until the next round starts (plan step 3: "late joiners wait
   *  or spectate"). Never in `#sim.players`. */
  readonly #spectatorIds = new Set<string>();
  #sim!: SimState;

  async onCreate(options: MatchRoomOptions = {}): Promise<void> {
    this.setState(new MatchState());
    this.setPatchRate(1000 / PATCH_RATE);
    this.#sim = { tick: 0, players: {}, arena: TESTBED_ARENA, rngSeed: hashSeed(this.roomId) };

    const mode: MatchMode = options.mode ?? "quick";
    await this.setMetadata(mode === "private" ? { mode, code: generateRoomCode() } : { mode });

    this.onMessage(MESSAGE_TYPES.INPUT, (client, payload: unknown) => {
      this.#onInput(client, payload);
    });

    this.#tickDriver = options.tickDriver ?? new IntervalTickDriver(this, TICK_RATE);
    this.#tickDriver.start(() => this.#tick());
  }

  onJoin(client: Client): void {
    const spawnIndex = this.state.players.size % TESTBED_ARENA.spawns.length;
    const spawn = TESTBED_ARENA.spawns[spawnIndex]!;
    const id = playerId(client.sessionId);

    const player = new PlayerState();
    player.id = client.sessionId;
    player.x = spawn.x;
    player.y = spawn.y;
    player.colorSeed = hashSeed(client.sessionId);

    // A room mid-round doesn't hand a brand-new player a body until the next
    // round starts (plan step 3) — they watch instead.
    const spectating = this.#director.phase.phase === "RoundActive";
    player.spectator = spectating;
    player.alive = !spectating;
    this.state.players.set(client.sessionId, player);

    if (spectating) {
      this.#spectatorIds.add(client.sessionId);
    } else {
      this.#sim = { ...this.#sim, players: { ...this.#sim.players, [id]: createSimPlayer(spawn) } };
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
    const id = playerId(client.sessionId);
    if (this.#director.phase.phase === "RoundActive") {
      this.#director.eliminateByDisconnect(id, this.#sim, this.#sim.tick);
    }
    this.allowReconnection(client, RECONNECTION_WINDOW_SECONDS).catch(() => {
      // Reconnection window expired or was rejected — onLeave() below still
      // runs and does the real cleanup either way.
    });
  }

  onLeave(client: Client): void {
    const id = playerId(client.sessionId);
    this.state.players.delete(client.sessionId);
    const remainingPlayers = { ...this.#sim.players };
    delete remainingPlayers[id];
    this.#sim = { ...this.#sim, players: remainingPlayers };
    this.#inputQueue.removePlayer(client.sessionId);
    this.#messageWindows.delete(client.sessionId);
    this.#spectatorIds.delete(client.sessionId);
    this.#director.removePlayer(id);
  }

  onDispose(): void {
    this.#tickDriver.stop();
  }

  #onInput(client: Client, payload: unknown): void {
    if (!this.#withinRateLimit(client.sessionId)) {
      console.warn(`[MatchRoom] rate-limited input from ${client.sessionId}, dropping`);
      return;
    }
    if (!isInputFrame(payload)) {
      console.warn(`[MatchRoom] malformed input from ${client.sessionId}, dropping`, payload);
      return;
    }
    this.#inputQueue.push(client.sessionId, payload);
  }

  #withinRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const window = this.#messageWindows.get(sessionId);

    if (!window || now - window.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
      this.#messageWindows.set(sessionId, { windowStartMs: now, count: 1 });
      return true;
    }

    if (window.count >= MAX_MESSAGES_PER_SECOND) {
      return false;
    }

    window.count += 1;
    return true;
  }

  #tick(): void {
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
    const directorResult = this.#director.tick(prevSim, stepResult.state, stepResult.events, connectedIds);
    this.#sim = this.#promoteSpectators(directorResult.state, directorResult.events);

    projectToSchema(this.#sim, this.state, lastProcessedSeq);
    this.#syncMatchFlow();

    // Transient combat/movement feedback (hit, blocked, guardBreak, ko,
    // whiff, jump, land, eliminated) — never stored in schema (plan Phase 4
    // step 4), so it's only sent when there's something to say.
    if (stepResult.events.length > 0) {
      this.broadcast(MESSAGE_TYPES.FX, stepResult.events);
    }
    if (directorResult.result) {
      this.broadcast(MESSAGE_TYPES.MATCH_RESULT, directorResult.result);
    }
  }

  /** Hands every waiting spectator a body the tick a new round starts. */
  #promoteSpectators(sim: SimState, events: MatchDirectorEvents): SimState {
    if (this.#spectatorIds.size === 0 || !events.some((event) => event.type === "roundStart")) {
      return sim;
    }

    let players = sim.players;
    for (const sessionId of this.#spectatorIds) {
      const id = playerId(sessionId);
      const spawnIndex = Object.keys(players).length % TESTBED_ARENA.spawns.length;
      players = { ...players, [id]: createSimPlayer(TESTBED_ARENA.spawns[spawnIndex]!) };
      this.#director.addPlayer(id);
      const schemaPlayer = this.state.players.get(sessionId);
      if (schemaPlayer) {
        schemaPlayer.spectator = false;
      }
    }
    this.#spectatorIds.clear();
    return { ...sim, players };
  }

  #syncMatchFlow(): void {
    const phase = this.#director.phase;
    this.state.phase = phase.phase;
    this.state.round = phase.round;
    this.state.phaseEndsAtTick = phase.phaseEndsAtTick ?? -1;

    this.state.players.forEach((schemaPlayer, sessionId) => {
      const id = playerId(sessionId);
      schemaPlayer.spectator = this.#spectatorIds.has(sessionId);
      schemaPlayer.alive = schemaPlayer.spectator ? false : this.#director.isAlive(id);
      schemaPlayer.roundsWon = phase.roundsWon[id] ?? 0;
    });
  }
}

type MatchDirectorEvents = ReturnType<MatchDirector["tick"]>["events"];
