import {
  hashSeed,
  MATCH_ROOM_NAME,
  MatchState,
  MESSAGE_TYPES,
  playerId,
  type MatchResult,
  type PlayerState,
  schemaToSimPlayer,
  TESTBED_ARENA,
  TICK_RATE,
  type PlayerId,
  type Vec,
} from "@castle-clash/shared";
import { Client, type Room } from "@colyseus/sdk";
import { Application, type Ticker } from "pixi.js";
import { matchStateToHud, type HudPlayerSnapshot } from "./hud.js";
import { KeyboardInput } from "./input/KeyboardInput.js";
import { matchStateToPhaseBanner, type MatchFlowSnapshot } from "./matchFlow.js";
import { Interpolator } from "./net/Interpolator.js";
import { Reconciler } from "./net/Reconciler.js";
import { PlayerRectsView } from "./render/PlayerRects.js";
import { playersToRects } from "./viewmodel/playersToRects.js";

const FIXED_DT_MS = 1000 / TICK_RATE;

/** How to connect to a match — resolved into the right `@colyseus/sdk` call
 *  by `GameClient.start()` (plan Phase 5 step 4: quick play, private rooms
 *  by code, and reconnection via a stored token, all share one entry
 *  point). */
export type JoinIntent =
  | { kind: "quick" }
  | { kind: "createPrivate" }
  | { kind: "joinPrivate"; code: string }
  | { kind: "joinById"; roomId: string }
  | { kind: "reconnect"; token: string };

/** A tiny pub/sub primitive — `subscribeHud`/`subscribeMatchFlow`/
 *  `subscribeMatchCode`/`subscribeMatchResult` were four copies of the same
 *  add-to-a-`Set`-and-return-an-unsubscriber shape before this existed. */
class Emitter<T> {
  readonly #listeners = new Set<(value: T) => void>();

  subscribe(listener: (value: T) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  get hasListeners(): boolean {
    return this.#listeners.size > 0;
  }

  emit(value: T): void {
    for (const listener of this.#listeners) {
      listener(value);
    }
  }
}

interface Resources {
  readonly app: Application;
  readonly room: Room<unknown, MatchState>;
  readonly keyboard: KeyboardInput;
  readonly view: PlayerRectsView;
  readonly localId: PlayerId;
  readonly rngSeed: number;
}

// Every lifecycle bug fixed in 0c5e721 was a resource used after it should no
// longer exist. Making the phase a type (checked after every await, and by
// every ticker/state callback) turns "is this call stale?" from a
// hand-placed check into something the compiler forces at each access.
type Phase =
  | { readonly tag: "idle" }
  | { readonly tag: "starting" }
  | { readonly tag: "connected"; readonly resources: Resources }
  | { readonly tag: "predicting"; readonly resources: Resources; readonly reconciler: Reconciler }
  | { readonly tag: "destroyed" };

export class GameClient {
  #phase: Phase = { tag: "idle" };

  #prevLocalPos: Vec = { x: 0, y: 0 };
  readonly #remoteInterpolators = new Map<PlayerId, Interpolator>();

  #accumulatorMs = 0;
  #seq = 0;
  #lastKnownServerTimeMs = 0;
  #lastKnownAtLocalMs = 0;

  readonly #hud = new Emitter<HudPlayerSnapshot[]>();
  readonly #matchFlow = new Emitter<MatchFlowSnapshot>();
  readonly #matchCode = new Emitter<string>();
  readonly #matchResult = new Emitter<MatchResult>();

  /** Subscribes to HUD snapshots (hp/stamina/weapon/action per player),
   *  pushed once per server patch — no polling, no per-frame React
   *  re-render. Returns an unsubscribe function. */
  subscribeHud(listener: (snapshots: HudPlayerSnapshot[]) => void): () => void {
    return this.#hud.subscribe(listener);
  }

  /** Subscribes to the match's phase/round/countdown banner, pushed once per
   *  server patch alongside the HUD. */
  subscribeMatchFlow(listener: (snapshot: MatchFlowSnapshot) => void): () => void {
    return this.#matchFlow.subscribe(listener);
  }

  /** Subscribes to the private room's join code, sent once right after
   *  creating one — nothing fires for a quick-play or joined-by-code room. */
  subscribeMatchCode(listener: (code: string) => void): () => void {
    return this.#matchCode.subscribe(listener);
  }

  /** Subscribes to the `MatchResult` broadcast once, the tick the match
   *  ends. */
  subscribeMatchResult(listener: (result: MatchResult) => void): () => void {
    return this.#matchResult.subscribe(listener);
  }

  /** The local player's current predicted/visual position — `null` before
   *  the reconciler is seeded. Exists for `game/debug.ts`'s `VITE_E2E`
   *  hook, so an e2e test can assert real movement happened without
   *  inspecting canvas pixels. */
  get localPosition(): Vec | null {
    const phase = this.#getPhase();
    return phase.tag === "predicting" ? phase.reconciler.visualPosition : null;
  }

  /** The connected room's id, once known — `null` before `start()` resolves. */
  get roomId(): string | null {
    const phase = this.#getPhase();
    return phase.tag === "connected" || phase.tag === "predicting" ? phase.resources.room.roomId : null;
  }

  /** The connected room's reconnection token, for the caller to persist and
   *  pass back as `{ kind: "reconnect" }` on a later `start()` call. */
  get reconnectionToken(): string | null {
    const phase = this.#getPhase();
    return phase.tag === "connected" || phase.tag === "predicting"
      ? phase.resources.room.reconnectionToken
      : null;
  }

  async start(
    container: HTMLElement,
    roomUrl: string,
    intent: JoinIntent = { kind: "quick" },
  ): Promise<void> {
    this.#phase = { tag: "starting" };

    const app = new Application();
    await app.init({ resizeTo: container, backgroundColor: 0x1a1a1a });
    // React StrictMode double-invokes the mount effect in dev: destroy() can
    // run while this await was pending. Nothing was in `resources` yet for
    // destroy() to tear down, so this continuation tears down what it just
    // acquired itself. (Read through #getPhase(), not the field directly:
    // tsc's control-flow narrowing doesn't know destroy() can mutate #phase
    // during this await, and will flag a direct post-await field comparison
    // as an impossible literal comparison.)
    if (this.#getPhase().tag === "destroyed") {
      app.destroy(true, { children: true });
      return;
    }
    container.appendChild(app.canvas);

    const view = new PlayerRectsView(app.stage);
    const client = new Client(roomUrl);
    const room = await joinRoom(client, intent);
    if (this.#getPhase().tag === "destroyed") {
      await room.leave();
      app.destroy(true, { children: true });
      return;
    }

    room.onMessage(MESSAGE_TYPES.MATCH_CODE, (code: string) => this.#matchCode.emit(code));
    room.onMessage(MESSAGE_TYPES.MATCH_RESULT, (result: MatchResult) => this.#matchResult.emit(result));

    const keyboard = new KeyboardInput();
    keyboard.attach();

    const resources: Resources = {
      app,
      room,
      keyboard,
      view,
      localId: playerId(room.sessionId),
      rngSeed: hashSeed(room.roomId),
    };
    this.#phase = { tag: "connected", resources };

    // The local player's schema entry can still be undefined right here even
    // though onJoin already ran server-side: joinOrCreate() can resolve
    // before the first full-state patch has decoded. Seed the reconciler now
    // if it's already there; onStateChange below also seeds it lazily on
    // whichever patch first carries it, so a client that lost this race still
    // predicts once its own entry shows up instead of never sending input.
    const initialEntry = room.state.players.get(room.sessionId);
    if (initialEntry) {
      this.#ensureReconciler(initialEntry);
    }

    room.onStateChange((state) => {
      if (this.#getPhase().tag === "destroyed") {
        return;
      }
      this.#lastKnownServerTimeMs = state.tick * FIXED_DT_MS;
      this.#lastKnownAtLocalMs = performance.now();

      state.players.forEach((schemaPlayer, sessionId) => {
        if (sessionId === room.sessionId) {
          this.#ensureReconciler(schemaPlayer);
          const phase = this.#getPhase();
          if (phase.tag === "predicting") {
            phase.reconciler.reconcileFromSchema(schemaPlayer);
          }
          return;
        }
        const id = playerId(sessionId);
        const interpolator = this.#remoteInterpolators.get(id) ?? new Interpolator();
        this.#remoteInterpolators.set(id, interpolator);
        interpolator.pushFromSchema(schemaPlayer, this.#lastKnownServerTimeMs);
      });

      if (this.#hud.hasListeners) {
        this.#hud.emit(matchStateToHud(state, room.sessionId));
      }
      if (this.#matchFlow.hasListeners) {
        this.#matchFlow.emit(matchStateToPhaseBanner(state));
      }
    });

    app.ticker.add((ticker: Ticker) => {
      if (this.#getPhase().tag === "destroyed") {
        return;
      }
      this.#accumulatorMs += ticker.deltaMS;

      while (this.#accumulatorMs >= FIXED_DT_MS) {
        const phase = this.#getPhase();
        if (phase.tag === "predicting") {
          this.#prevLocalPos = { ...phase.reconciler.visualPosition };
        }
        this.#fixedUpdate();
        this.#accumulatorMs -= FIXED_DT_MS;
      }

      const alpha = this.#accumulatorMs / FIXED_DT_MS;
      view.sync(playersToRects(room.state, this.#renderOverrides(alpha)));
    });
  }

  async destroy(): Promise<void> {
    const phase = this.#getPhase();
    this.#phase = { tag: "destroyed" };

    if (phase.tag !== "connected" && phase.tag !== "predicting") {
      // idle/starting: nothing acquired yet, or start()'s own continuation
      // will tear down whatever it acquires once its pending await settles.
      // destroyed: already torn down.
      return;
    }
    await this.#teardown(phase.resources);
  }

  async #teardown(resources: Resources): Promise<void> {
    resources.keyboard.detach();
    await resources.room.leave();
    resources.app.destroy(true, { children: true });
  }

  #getPhase(): Phase {
    return this.#phase;
  }

  #ensureReconciler(schemaPlayer: PlayerState): void {
    const phase = this.#getPhase();
    if (phase.tag !== "connected") {
      return;
    }
    const { resources } = phase;
    const reconciler = new Reconciler(schemaToSimPlayer(schemaPlayer), {
      arena: TESTBED_ARENA,
      rngSeed: resources.rngSeed,
      localId: resources.localId,
    });
    this.#prevLocalPos = { ...reconciler.visualPosition };
    this.#phase = { tag: "predicting", resources, reconciler };
  }

  #fixedUpdate(): void {
    const phase = this.#getPhase();
    if (phase.tag !== "predicting") {
      return;
    }
    const { resources, reconciler } = phase;
    this.#seq += 1;
    const frame = { seq: this.#seq, bits: resources.keyboard.sample() };
    reconciler.predict(frame);
    reconciler.tick();
    resources.room.send(MESSAGE_TYPES.INPUT, frame);
  }

  #renderOverrides(alpha: number): Partial<Record<string, Vec>> {
    const overrides: Partial<Record<string, Vec>> = {};

    const phase = this.#getPhase();
    if (phase.tag === "predicting") {
      const { resources, reconciler } = phase;
      overrides[resources.localId] = lerp(this.#prevLocalPos, reconciler.visualPosition, alpha);
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

/** Resolves a `JoinIntent` into the matching `@colyseus/sdk` call — the only
 *  place that has to know quick play, private-by-code, and reconnection are
 *  different wire calls; `GameClient.start()` just awaits a `Room` either
 *  way. */
function joinRoom(client: Client, intent: JoinIntent): Promise<Room<unknown, MatchState>> {
  switch (intent.kind) {
    case "quick":
      return client.joinOrCreate<MatchState>(MATCH_ROOM_NAME, { mode: "quick" }, MatchState);
    case "createPrivate":
      return client.create<MatchState>(MATCH_ROOM_NAME, { mode: "private" }, MatchState);
    case "joinPrivate":
      return client.join<MatchState>(MATCH_ROOM_NAME, { mode: "private", code: intent.code }, MatchState);
    case "joinById":
      return client.joinById<MatchState>(intent.roomId, undefined, MatchState);
    case "reconnect":
      return client.reconnect<MatchState>(intent.token, MatchState);
  }
}
