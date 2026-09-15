import {
  hashSeed,
  MATCH_ROOM_NAME,
  MatchState,
  MESSAGE_TYPES,
  playerId,
  TESTBED_ARENA,
  TICK_RATE,
  type PlayerId,
  type Vec,
} from "@castle-clash/shared";
import { Client, type Room } from "@colyseus/sdk";
import { Application, type Ticker } from "pixi.js";
import { KeyboardInput } from "./input/KeyboardInput.js";
import { Interpolator } from "./net/Interpolator.js";
import { Reconciler } from "./net/Reconciler.js";
import { PlayerRectsView } from "./render/PlayerRects.js";
import { playersToRects } from "./viewmodel/playersToRects.js";

const FIXED_DT_MS = 1000 / TICK_RATE;

export class GameClient {
  #app: Application | undefined;
  #room: Room<unknown, MatchState> | undefined;
  #keyboard: KeyboardInput | undefined;

  #localId: PlayerId | undefined;
  #reconciler: Reconciler | undefined;
  #prevLocalPos: Vec = { x: 0, y: 0 };
  readonly #remoteInterpolators = new Map<PlayerId, Interpolator>();

  #accumulatorMs = 0;
  #seq = 0;
  #lastKnownServerTimeMs = 0;
  #lastKnownAtLocalMs = 0;

  async start(container: HTMLElement, roomUrl: string): Promise<void> {
    const app = new Application();
    await app.init({ resizeTo: container, backgroundColor: 0x1a1a1a });
    container.appendChild(app.canvas);

    const view = new PlayerRectsView(app.stage);
    const client = new Client(roomUrl);
    const room = await client.joinOrCreate<MatchState>(MATCH_ROOM_NAME, undefined, MatchState);

    this.#app = app;
    this.#room = room;
    this.#localId = playerId(room.sessionId);

    this.#keyboard = new KeyboardInput();
    this.#keyboard.attach();

    const rngSeed = hashSeed(room.roomId);
    const localEntry = room.state.players.get(room.sessionId);
    if (localEntry) {
      this.#reconciler = new Reconciler(
        {
          pos: { x: localEntry.x, y: localEntry.y },
          vel: { x: localEntry.vx, y: localEntry.vy },
          facing: localEntry.facing === -1 ? -1 : 1,
          grounded: localEntry.grounded,
          coyoteTicks: localEntry.coyoteTicks,
          jumpBufferTicks: localEntry.jumpBufferTicks,
          dropThroughTicks: localEntry.dropThroughTicks,
          lastInputSeq: localEntry.lastProcessedSeq,
        },
        { arena: TESTBED_ARENA, rngSeed, localId: this.#localId },
      );
      this.#prevLocalPos = { ...this.#reconciler.visualPosition };
    }

    room.onStateChange((state) => {
      this.#lastKnownServerTimeMs = state.tick * FIXED_DT_MS;
      this.#lastKnownAtLocalMs = performance.now();

      state.players.forEach((schemaPlayer, sessionId) => {
        if (sessionId === room.sessionId) {
          this.#reconciler?.reconcileFromSchema(schemaPlayer);
          return;
        }
        const id = playerId(sessionId);
        const interpolator = this.#remoteInterpolators.get(id) ?? new Interpolator();
        this.#remoteInterpolators.set(id, interpolator);
        interpolator.pushFromSchema(schemaPlayer, this.#lastKnownServerTimeMs);
      });
    });

    app.ticker.add((ticker: Ticker) => {
      this.#accumulatorMs += ticker.deltaMS;

      while (this.#accumulatorMs >= FIXED_DT_MS) {
        if (this.#reconciler) {
          this.#prevLocalPos = { ...this.#reconciler.visualPosition };
        }
        this.#fixedUpdate(room);
        this.#accumulatorMs -= FIXED_DT_MS;
      }

      const alpha = this.#accumulatorMs / FIXED_DT_MS;
      view.sync(playersToRects(room.state, this.#renderOverrides(alpha)));
    });
  }

  async destroy(): Promise<void> {
    this.#keyboard?.detach();
    this.#keyboard = undefined;

    await this.#room?.leave();
    this.#room = undefined;

    this.#app?.destroy(true, { children: true });
    this.#app = undefined;
  }

  #fixedUpdate(room: Room<unknown, MatchState>): void {
    if (!this.#keyboard || !this.#reconciler) {
      return;
    }
    this.#seq += 1;
    const frame = { seq: this.#seq, bits: this.#keyboard.sample() };
    this.#reconciler.predict(frame);
    this.#reconciler.tick();
    room.send(MESSAGE_TYPES.INPUT, frame);
  }

  #renderOverrides(alpha: number): Partial<Record<string, Vec>> {
    const overrides: Partial<Record<string, Vec>> = {};

    if (this.#localId && this.#reconciler) {
      overrides[this.#localId] = lerp(this.#prevLocalPos, this.#reconciler.visualPosition, alpha);
    }

    const serverTimeNow =
      this.#lastKnownServerTimeMs + (performance.now() - this.#lastKnownAtLocalMs);
    for (const [id, interpolator] of this.#remoteInterpolators) {
      const pos = interpolator.positionAt(serverTimeNow);
      if (pos) {
        overrides[id] = pos;
      }
    }

    return overrides;
  }
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
