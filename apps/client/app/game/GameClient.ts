import {
  hashSeed,
  MATCH_ROOM_NAME,
  MatchState,
  MESSAGE_TYPES,
  playerId,
  type PlayerState,
  schemaToSimPlayer,
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
  // React StrictMode double-invokes the mount effect in dev: the first
  // start() can still be awaiting app.init()/joinOrCreate() when its own
  // cleanup calls destroy() before the second mount's start() begins. Without
  // this guard, the first start() resumes after destroy() already ran and
  // finishes setup anyway — two Applications, two room connections, one
  // container (this is how the bug was actually found: two canvases stacked
  // in the real browser, invisible to unit tests that mock GameClient
  // entirely). Checked after every await in start().
  #destroyed = false;

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
    if (this.#destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    container.appendChild(app.canvas);

    const view = new PlayerRectsView(app.stage);
    const client = new Client(roomUrl);
    const room = await client.joinOrCreate<MatchState>(MATCH_ROOM_NAME, undefined, MatchState);
    if (this.#destroyed) {
      await room.leave();
      app.destroy(true, { children: true });
      return;
    }

    this.#app = app;
    this.#room = room;
    this.#localId = playerId(room.sessionId);
    const rngSeed = hashSeed(room.roomId);

    this.#keyboard = new KeyboardInput();
    this.#keyboard.attach();

    // The local player's schema entry can still be undefined right here even
    // though onJoin already ran server-side: joinOrCreate() can resolve
    // before the first full-state patch has decoded. Seed the reconciler now
    // if it's already there, but onStateChange below also seeds it lazily on
    // whichever patch first carries it — without that fallback, a client
    // that lost this race predicts nothing and silently never sends input,
    // forever (found by actually loading the page, not by a unit test: every
    // existing test mocks either GameClient or a state object that already
    // has the local player in it).
    const initialEntry = room.state.players.get(room.sessionId);
    if (initialEntry) {
      this.#ensureReconciler(initialEntry, rngSeed);
    }

    room.onStateChange((state) => {
      this.#lastKnownServerTimeMs = state.tick * FIXED_DT_MS;
      this.#lastKnownAtLocalMs = performance.now();

      state.players.forEach((schemaPlayer, sessionId) => {
        if (sessionId === room.sessionId) {
          this.#ensureReconciler(schemaPlayer, rngSeed);
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
    this.#destroyed = true;
    this.#keyboard?.detach();
    this.#keyboard = undefined;

    await this.#room?.leave();
    this.#room = undefined;

    this.#app?.destroy(true, { children: true });
    this.#app = undefined;
  }

  #ensureReconciler(schemaPlayer: PlayerState, rngSeed: number): void {
    if (this.#reconciler || !this.#localId) {
      return;
    }
    this.#reconciler = new Reconciler(schemaToSimPlayer(schemaPlayer), {
      arena: TESTBED_ARENA,
      rngSeed,
      localId: this.#localId,
    });
    this.#prevLocalPos = { ...this.#reconciler.visualPosition };
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
