import {
  getArena,
  hashSeed,
  isArenaId,
  MATCH_ROOM_NAME,
  MatchState,
  MESSAGE_TYPES,
  playerId,
  TESTBED_ARENA,
  type ArenaDefinition,
  type MatchResult,
  type PlayerState,
  schemaToSimPlayer,
  type SimEvent,
  TICK_RATE,
  type PlayerId,
  type Vec,
} from "@castle-clash/shared";
import { Client, type Room } from "@colyseus/sdk";
import { Application, Container, type Ticker } from "pixi.js";
import { matchStateToHud, type HudPlayerSnapshot } from "./hud.js";
import { KeyboardInput } from "./input/KeyboardInput.js";
import { matchStateToPhaseBanner, type MatchFlowSnapshot } from "./matchFlow.js";
import { Interpolator } from "./net/Interpolator.js";
import { Reconciler } from "./net/Reconciler.js";
import { ArenaView } from "./render/ArenaView.js";
import { CameraController, DEFAULT_CAMERA_CONFIG } from "./render/Camera.js";
import { HazardView } from "./render/HazardView.js";
import { PlayerRectsView } from "./render/PlayerRects.js";
import { hazardsToRects } from "./viewmodel/hazardsToRects.js";
import { playersToRects, type PlayerRect } from "./viewmodel/playersToRects.js";

const FIXED_DT_MS = 1000 / TICK_RATE;

/** How to connect to a match — resolved into the right `@colyseus/sdk` call
 *  by `GameClient.start()` (plan Phase 5 step 4: quick play, private rooms
 *  by code, and reconnection via a stored token, all share one entry
 *  point). `createPrivate`'s `arenaId` (Phase 6) is the lobby's host-side
 *  arena picker — quick play always takes `MatchRoom`'s random default,
 *  since there's no host to ask. An invalid/omitted `arenaId` is the
 *  server's problem, not this type's: `MatchRoomOptions.arenaId` already
 *  falls back to random for anything that isn't a real `ArenaId`. */
export type JoinIntent =
  | { kind: "quick" }
  | { kind: "createPrivate"; arenaId?: string }
  | { kind: "joinPrivate"; code: string }
  | { kind: "joinById"; roomId: string }
  | { kind: "reconnect"; token: string };

/** The client's view of its own private `draft:offer` (plan Phase 7 step 5)
 *  — `picked` is set locally the instant `pickPowerUp` sends, before the
 *  server's own ack (the `powerups` sync) arrives, so `DraftOverlay` can
 *  disable its cards immediately rather than waiting a round trip. */
export interface DraftOfferSnapshot {
  offers: readonly string[];
  endsAtTick: number;
  picked: string | null;
}

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
  readonly arenaView: ArenaView;
  readonly hazardView: HazardView;
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
  #currentDraftOffer: DraftOfferSnapshot | null = null;

  /** The match's resolved arena and its camera — both seeded once
   *  `MatchState.arenaId` is known (see `#ensureArena`), which happens
   *  independently of (and usually before) the local player's own schema
   *  entry, so this doesn't reuse `#ensureReconciler`'s seeding path. */
  #resolvedArena: ArenaDefinition | null = null;
  #camera: CameraController | null = null;

  readonly #hud = new Emitter<HudPlayerSnapshot[]>();
  readonly #matchFlow = new Emitter<MatchFlowSnapshot>();
  readonly #matchCode = new Emitter<string>();
  readonly #matchResult = new Emitter<MatchResult>();
  readonly #draftOffer = new Emitter<DraftOfferSnapshot | null>();

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

  /** Subscribes to this client's own private draft offer (plan Phase 7) —
   *  `null` once the round's `Draft` phase ends (picked, auto-picked, or
   *  timed out), whichever came from the server. */
  subscribeDraftOffer(listener: (offer: DraftOfferSnapshot | null) => void): () => void {
    return this.#draftOffer.subscribe(listener);
  }

  /** Sends `draft:pick` for the current offer — a no-op if there's no
   *  active offer or this client already picked (mirrors the server's own
   *  once-only validation in `DraftService.pick`, so a double-click can't
   *  even get as far as a wasted round trip). */
  pickPowerUp(id: string): void {
    const phase = this.#getPhase();
    if (phase.tag !== "connected" && phase.tag !== "predicting") {
      return;
    }
    if (!this.#currentDraftOffer || this.#currentDraftOffer.picked) {
      return;
    }
    this.#currentDraftOffer = { ...this.#currentDraftOffer, picked: id };
    this.#draftOffer.emit(this.#currentDraftOffer);
    phase.resources.room.send(MESSAGE_TYPES.DRAFT_PICK, { id });
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
    /** Forwarded to `MatchRoom.onAuth` (plan Phase 8 step 6) — `undefined`
     *  for a caller with no session, which `onAuth` rejects the same way
     *  a missing token always has. Callers should fetch this fresh right
     *  before calling `start()` (`auth/supabase.ts`'s `getAccessToken()`
     *  re-reads the current session every time) rather than caching it, so
     *  a long-lived tab's later reconnect never sends an expired token. */
    accessToken?: string,
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

    // Layered so hazards always draw over static geometry and players
    // always draw over hazards, regardless of sync/creation order within a
    // layer — matches `Container.addChild`'s append-only ordering each
    // view already relies on internally.
    const arenaLayer = new Container();
    const hazardLayer = new Container();
    const playerLayer = new Container();
    app.stage.addChild(arenaLayer, hazardLayer, playerLayer);

    const view = new PlayerRectsView(playerLayer);
    const arenaView = new ArenaView(arenaLayer);
    const hazardView = new HazardView(hazardLayer);
    const client = new Client(roomUrl);
    if (accessToken) {
      client.auth.token = accessToken;
    }
    const room = await joinRoom(client, intent);
    if (this.#getPhase().tag === "destroyed") {
      await room.leave();
      app.destroy(true, { children: true });
      return;
    }

    room.onMessage(MESSAGE_TYPES.MATCH_CODE, (code: string) => this.#matchCode.emit(code));
    room.onMessage(MESSAGE_TYPES.MATCH_RESULT, (result: MatchResult) => this.#matchResult.emit(result));
    room.onMessage(MESSAGE_TYPES.FX, (events: SimEvent[]) => this.#shakeForEvents(events));
    room.onMessage(MESSAGE_TYPES.DRAFT_OFFER, (payload: { offers: string[]; endsAtTick: number }) => {
      this.#currentDraftOffer = { offers: payload.offers, endsAtTick: payload.endsAtTick, picked: null };
      this.#draftOffer.emit(this.#currentDraftOffer);
    });

    const keyboard = new KeyboardInput();
    keyboard.attach();

    const resources: Resources = {
      app,
      room,
      keyboard,
      view,
      arenaView,
      hazardView,
      localId: playerId(room.sessionId),
      rngSeed: hashSeed(room.roomId),
    };
    this.#phase = { tag: "connected", resources };

    // Same race as the reconciler below (join can resolve before the first
    // full-state patch decodes) — `arenaId` just doesn't depend on the
    // local player's own schema entry existing yet, so it's seeded
    // independently rather than piggybacking on `#ensureReconciler`.
    this.#ensureArena(room.state);

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
      this.#ensureArena(state);
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
      // The round's Draft phase ended (picked, auto-picked, or timed out) —
      // clear the overlay's offer regardless of which of those it was, all
      // three look the same from here: `state.phase` moved on.
      if (this.#currentDraftOffer && state.phase !== "Draft") {
        this.#currentDraftOffer = null;
        this.#draftOffer.emit(null);
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
      const rects = playersToRects(room.state, this.#renderOverrides(alpha));
      view.sync(rects);

      if (this.#resolvedArena) {
        hazardView.sync(hazardsToRects(room.state, this.#resolvedArena.hazards));
      }
      this.#updateCamera(app, rects, ticker.deltaMS / 1000);
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
      arena: this.#resolvedArena ?? this.#resolveArena(resources.room.state),
      rngSeed: resources.rngSeed,
      localId: resources.localId,
    });
    this.#prevLocalPos = { ...reconciler.visualPosition };
    this.#phase = { tag: "predicting", resources, reconciler };
  }

  /** The match's real arena (Phase 6), read by id from `MatchState.arenaId`
   *  — static geometry is never sent over the wire (plan step 4), so the
   *  client loads it from `shared`'s arena registry, the same way the
   *  server does. Falls back to `TESTBED_ARENA` only for the impossible
   *  case of an empty/unrecognized `arenaId` (e.g. a patch read before
   *  `onCreate`'s own set has arrived), so prediction never crashes on a
   *  missing arena — it just predicts against the wrong one for a tick. */
  #resolveArena(state: MatchState): ArenaDefinition {
    return isArenaId(state.arenaId) ? getArena(state.arenaId) : TESTBED_ARENA;
  }

  /** Seeds `#resolvedArena`/`#camera`/`ArenaView` the first tick
   *  `MatchState.arenaId` resolves to a real arena — idempotent, and safe
   *  to call from both right after join and every `onStateChange` until it
   *  sticks (mirrors `#ensureReconciler`'s own race-tolerant seeding). */
  #ensureArena(state: MatchState): void {
    if (this.#resolvedArena || !isArenaId(state.arenaId)) {
      return;
    }
    const phase = this.#getPhase();
    if (phase.tag !== "connected" && phase.tag !== "predicting") {
      return;
    }
    const arena = getArena(state.arenaId);
    this.#resolvedArena = arena;
    // Framed against the canvas's actual current size, not a hardcoded
    // 1280x720 — `resizeTo: container` (see `start()`) means that can
    // genuinely differ from `DEFAULT_CAMERA_CONFIG`'s fallback.
    this.#camera = new CameraController(arena.bounds, {
      ...DEFAULT_CAMERA_CONFIG,
      viewportWidth: phase.resources.app.screen.width,
      viewportHeight: phase.resources.app.screen.height,
    });
    phase.resources.arenaView.setArena(arena);
  }

  /** Shakes the camera for impactful `fx` events (plan step 5: "shakes on
   *  events") — a light shake for a landed hit or a hazard reacting, a
   *  heavier one for a guard break, a KO, or a full elimination. Whiffs,
   *  blocks, jumps, and landings stay quiet; a shake on every swing would
   *  just be noise. */
  #shakeForEvents(events: readonly SimEvent[]): void {
    let intensity = 0;
    for (const event of events) {
      switch (event.type) {
        case "hit":
        case "hazardBreak":
        case "hazardFall":
        case "hazardTrap":
          intensity = Math.max(intensity, 0.5);
          break;
        case "guardBreak":
        case "ko":
        case "eliminated":
          intensity = Math.max(intensity, 1);
          break;
        default:
          break;
      }
    }
    if (intensity > 0) {
      this.#camera?.shake(intensity);
    }
  }

  /** Lerps the camera toward every living player's current render position
   *  and applies it as `app.stage`'s pan/zoom — every layer (arena,
   *  hazards, players) is a child of `stage`, so one transform moves them
   *  together. A no-op until `#ensureArena` seeds `#camera`. */
  #updateCamera(app: Application, rects: readonly PlayerRect[], dtSeconds: number): void {
    const camera = this.#camera;
    const phase = this.#getPhase();
    if (!camera || (phase.tag !== "connected" && phase.tag !== "predicting")) {
      return;
    }
    const living = rects.filter((rect) => phase.resources.room.state.players.get(rect.id)?.alive !== false);
    camera.update(living, dtSeconds);

    const frame = camera.frame;
    app.stage.scale.set(frame.zoom);
    app.stage.position.set(
      app.screen.width / 2 - frame.x * frame.zoom,
      app.screen.height / 2 - frame.y * frame.zoom,
    );
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
      return client.create<MatchState>(MATCH_ROOM_NAME, { mode: "private", arenaId: intent.arenaId }, MatchState);
    case "joinPrivate":
      return client.join<MatchState>(MATCH_ROOM_NAME, { mode: "private", code: intent.code }, MatchState);
    case "joinById":
      return client.joinById<MatchState>(intent.roomId, undefined, MatchState);
    case "reconnect":
      return client.reconnect<MatchState>(intent.token, MatchState);
  }
}
