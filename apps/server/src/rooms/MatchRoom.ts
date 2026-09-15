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
  type SimState,
} from "@castle-clash/shared";
import { type Client, Room } from "colyseus";
import { InputQueue } from "./InputQueue.js";
import { IntervalTickDriver, type TickDriver } from "./TickDriver.js";

/** Generous headroom over one input per tick, so a legitimate client that
 *  briefly resends (e.g. after a reconnect) isn't punished, while a flood is. */
const MAX_MESSAGES_PER_SECOND = TICK_RATE * 2;
const RATE_LIMIT_WINDOW_MS = 1000;

export interface MatchRoomOptions {
  tickDriver?: TickDriver;
}

export class MatchRoom extends Room<{ state: MatchState }> {
  #tickDriver!: TickDriver;
  readonly #inputQueue = new InputQueue();
  readonly #messageWindows = new Map<string, { windowStartMs: number; count: number }>();
  #sim!: SimState;

  onCreate(options: MatchRoomOptions = {}): void {
    this.setState(new MatchState());
    this.setPatchRate(1000 / PATCH_RATE);
    this.#sim = { tick: 0, players: {}, arena: TESTBED_ARENA, rngSeed: hashSeed(this.roomId) };

    this.onMessage(MESSAGE_TYPES.INPUT, (client, payload: unknown) => {
      this.#onInput(client, payload);
    });

    this.#tickDriver = options.tickDriver ?? new IntervalTickDriver(this, TICK_RATE);
    this.#tickDriver.start(() => this.#tick());
  }

  onJoin(client: Client): void {
    const spawnIndex = this.state.players.size % TESTBED_ARENA.spawns.length;
    const spawn = TESTBED_ARENA.spawns[spawnIndex]!;

    const player = new PlayerState();
    player.id = client.sessionId;
    player.x = spawn.x;
    player.y = spawn.y;
    player.colorSeed = hashSeed(client.sessionId);
    this.state.players.set(client.sessionId, player);

    this.#sim = {
      ...this.#sim,
      players: { ...this.#sim.players, [client.sessionId]: createSimPlayer(spawn) },
    };
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    const remainingPlayers = { ...this.#sim.players };
    delete remainingPlayers[playerId(client.sessionId)];
    this.#sim = { ...this.#sim, players: remainingPlayers };
    this.#inputQueue.removePlayer(client.sessionId);
    this.#messageWindows.delete(client.sessionId);
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

    for (const sessionId of Object.keys(this.#sim.players)) {
      const frame = this.#inputQueue.consume(sessionId);
      inputs[sessionId] = frame;
      lastProcessedSeq[sessionId] = frame.seq;
    }

    const result = simulationStep(this.#sim, inputs);
    this.#sim = result.state;
    projectToSchema(this.#sim, this.state, lastProcessedSeq);

    // Transient combat/movement feedback (hit, blocked, guardBreak, ko,
    // whiff, jump, land) — never stored in schema (plan Phase 4 step 4), so
    // it's only sent when there's something to say.
    if (result.events.length > 0) {
      this.broadcast(MESSAGE_TYPES.FX, result.events);
    }
  }
}
