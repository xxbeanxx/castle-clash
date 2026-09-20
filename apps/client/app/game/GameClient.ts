import {
  findArena,
  hashSeed,
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
import "./pixiCsp.js";
import { matchStateToHud, type HudPlayerSnapshot } from "./hud.js";
import { CompositeInput } from "./input/CompositeInput.js";
import type { InputSource } from "./input/InputSource.js";
import { GamepadInput } from "./input/GamepadInput.js";
import { KeyboardInput } from "./input/KeyboardInput.js";
import { FrameStats, type FrameSummary } from "./FrameStats.js";
import { planSteps } from "./fixedStep.js";
import { matchStateToRoomInfo, type RoomInfoSnapshot } from "./roomInfo.js";
import { matchStateToPhaseBanner, type MatchFlowSnapshot } from "./matchFlow.js";
import { Interpolator } from "./net/Interpolator.js";
import { Reconciler } from "./net/Reconciler.js";
import { ArenaView } from "./render/ArenaView.js";
import { Camera } from "./render/Camera.js";
import {
  PIXEL_ART_INIT,
  SurfaceController,
  nearestTextureScaling,
} from "./render/SurfaceController.js";
import type { SurfaceLayout } from "./render/surface.js";
import { HazardView } from "./render/HazardView.js";
import { PlayerRectsView } from "./render/PlayerRects.js";
import { hazardsToRects } from "./viewmodel/hazardsToRects.js";
import { playersToRects } from "./viewmodel/playersToRects.js";

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
  /** Practice (Phase 14): a private room with 1 to 3 bots of one tier; nobody waits. */
  | { kind: "practice"; botCount: number; tier: string; arenaId?: string }
  /** The first-run tutorial (Phase 14): a room with a training dummy on the testbed. */
  | { kind: "tutorial" }
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

/** A `PlayerState.cosmetics` schema instance's fields as a plain object —
 *  shared by `GameClient.allCosmetics`'s return type and `game/debug.ts`'s
 *  `CastleClashDebugHook`, so the shape only exists once. */
export interface PlayerCosmetics {
  tintPrimary: number;
  helmetId: string;
  capeId: string;
  weaponStyleId: string;
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

export type ConnectionState = "connected" | "reconnecting" | "lost";

interface Resources {
  readonly app: Application;
  readonly surface: SurfaceController;
  readonly room: Room<unknown, MatchState>;
  readonly input: InputSource;
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
  /** Input sources beyond the keyboard (touch, later gamepad), owned by the caller: the UI layer
   *  creates them, `start()` attaches them for the match's life and `destroy()` detaches them. */
  readonly #extraInputs: readonly InputSource[];

  constructor(extraInputs: readonly InputSource[] = []) {
    this.#extraInputs = extraInputs;
  }

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
  #camera: Camera | null = null;

  readonly #frameStats = new FrameStats();

  /** Rolling frame-time summary, for the `VITE_E2E` hook (Phase 13 step 12's perf budget). */
  get frameSummary(): FrameSummary | null {
    return this.#frameStats.summary();
  }

  /** Whether the room's socket is up. `reconnecting` while the SDK retries a dropped socket (a
   *  backgrounded phone tab, a tunnel); `lost` once it gives up or the server ends the session. */
  #connectionState: ConnectionState = "connected";
  readonly #connection = new Emitter<ConnectionState>();

  readonly #hud = new Emitter<HudPlayerSnapshot[]>();
  readonly #matchFlow = new Emitter<MatchFlowSnapshot>();
  readonly #matchCode = new Emitter<string>();
  /** `null` once a rematch has left `MatchOver`, so the results screen goes away by itself. */
  readonly #matchResult = new Emitter<MatchResult | null>();
  #resultShown = false;
  readonly #roomInfo = new Emitter<RoomInfoSnapshot>();
  readonly #botDropped = new Emitter<string>();
  readonly #draftOffer = new Emitter<DraftOfferSnapshot | null>();
  readonly #profileUnlocks = new Emitter<readonly string[]>();

  /** Subscribes to HUD snapshots (hp/stamina/weapon/action per player),
   *  pushed once per server patch — no polling, no per-frame React
   *  re-render. Returns an unsubscribe function. */
  /** Closes the socket with the SDK's "may try reconnect" code (4010), for the `VITE_E2E` hook to
   *  exercise its reconnection path without a flaky network. Any other code from the client side
   *  (a consented 1000, or an arbitrary 4000) is reported by the SDK as a final leave, and a drop
   *  inside the SDK's 5 s `minUptime` after joining is not retried either. */
  simulateDrop(): void {
    const phase = this.#getPhase();
    if (phase.tag === "connected" || phase.tag === "predicting") {
      phase.resources.room.connection.close(4010, "e2e simulated drop");
    }
  }

  subscribeConnection(listener: (state: ConnectionState) => void): () => void {
    listener(this.#connectionState);
    return this.#connection.subscribe(listener);
  }

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
  subscribeMatchResult(listener: (result: MatchResult | null) => void): () => void {
    return this.#matchResult.subscribe(listener);
  }

  /** Subscribes to the room's solo-play facts: its mode, whether a bot is on offer, whether this
   *  player has asked for a rematch, and who the bots are. Pushed once per server patch. */
  subscribeRoomInfo(listener: (info: RoomInfoSnapshot) => void): () => void {
    return this.#roomInfo.subscribe(listener);
  }

  /** Fires with the bot's name when a human joined and the player's backfill bot stepped aside. */
  subscribeBotDropped(listener: (name: string) => void): () => void {
    return this.#botDropped.subscribe(listener);
  }

  /** Asks the server for a bot (only honored while `RoomInfoSnapshot.backfillOfferable` stands). */
  requestBackfillBot(tier: string): void {
    const phase = this.#getPhase();
    if (phase.tag === "connected" || phase.tag === "predicting") {
      phase.resources.room.send(MESSAGE_TYPES.BOT_BACKFILL, { tier });
    }
  }

  /** "Play again" on the results screen: the room restarts once every human still seated asked. */
  requestRematch(): void {
    const phase = this.#getPhase();
    if (phase.tag === "connected" || phase.tag === "predicting") {
      phase.resources.room.send(MESSAGE_TYPES.REMATCH);
    }
  }

  /** Subscribes to this client's own private draft offer (plan Phase 7) —
   *  `null` once the round's `Draft` phase ends (picked, auto-picked, or
   *  timed out), whichever came from the server. */
  subscribeDraftOffer(listener: (offer: DraftOfferSnapshot | null) => void): () => void {
    return this.#draftOffer.subscribe(listener);
  }

  /** Subscribes to `MESSAGE_TYPES.PROFILE_UNLOCKS` (plan Phase 9 step 3) —
   *  fires with the newly-unlocked catalog item ids once, only for the
   *  player who crossed a threshold; nothing fires for anyone else. */
  subscribeProfileUnlocks(listener: (itemIds: readonly string[]) => void): () => void {
    return this.#profileUnlocks.subscribe(listener);
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

  /** The render surface's current layout plus the stage transform actually applied, for the
   *  `VITE_E2E` hook (asserting integer scale on a device viewport without reading pixels).
   *  `null` until the room is connected. */
  get surfaceState(): {
    layout: SurfaceLayout;
    canvas: { width: number; height: number };
    stage: { scale: number; x: number; y: number };
  } | null {
    const phase = this.#getPhase();
    if (phase.tag !== "connected" && phase.tag !== "predicting") {
      return null;
    }
    const { app, surface } = phase.resources;
    if (!surface.layout) {
      return null;
    }
    return {
      layout: surface.layout,
      canvas: { width: app.canvas.width, height: app.canvas.height },
      stage: { scale: app.stage.scale.x, x: app.stage.position.x, y: app.stage.position.y },
    };
  }

  /** Every connected player's server-synced cosmetics — exists for
   *  `game/debug.ts`'s `VITE_E2E` hook (plan Phase 9's e2e gate: "the
   *  opponent context reads the player's tint via the debug hook"), so a
   *  test can assert a saved loadout propagated to another browser without
   *  decoding `@colyseus/schema` itself. Empty before a room is connected. */
  get allCosmetics(): PlayerCosmetics[] {
    const phase = this.#getPhase();
    if (phase.tag !== "connected" && phase.tag !== "predicting") {
      return [];
    }
    const cosmetics: PlayerCosmetics[] = [];
    phase.resources.room.state.players.forEach((player) => {
      cosmetics.push({
        tintPrimary: player.cosmetics.tintPrimary,
        helmetId: player.cosmetics.helmetId,
        capeId: player.cosmetics.capeId,
        weaponStyleId: player.cosmetics.weaponStyleId,
      });
    });
    return cosmetics;
  }

  /** The connected room's id, once known — `null` before `start()` resolves. */
  get roomId(): string | null {
    const phase = this.#getPhase();
    return phase.tag === "connected" || phase.tag === "predicting"
      ? phase.resources.room.roomId
      : null;
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
    nearestTextureScaling();
    await app.init(PIXEL_ART_INIT);
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
    // Sized to the container in physical pixels, at an integer scale (ADR 0002).
    const surface = new SurfaceController(app, container);
    surface.start();

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

    // `onDrop` = socket lost, SDK retrying with the reconnection token; `onReconnect` = back;
    // `onLeave` = final (also fires after our own `leave()`, hence the destroyed guard).
    room.onDrop(() => this.#setConnection("reconnecting"));
    room.onReconnect(() => this.#setConnection("connected"));
    room.onLeave(() => this.#setConnection("lost"));
    room.onMessage(MESSAGE_TYPES.MATCH_CODE, (code: string) => this.#matchCode.emit(code));
    room.onMessage(MESSAGE_TYPES.MATCH_RESULT, (result: MatchResult) => {
      this.#resultShown = true;
      this.#matchResult.emit(result);
    });
    room.onMessage(MESSAGE_TYPES.BOT_DROPPED, (payload: { name: string }) =>
      this.#botDropped.emit(payload.name),
    );
    room.onMessage(MESSAGE_TYPES.PROFILE_UNLOCKS, (itemIds: string[]) =>
      this.#profileUnlocks.emit(itemIds),
    );
    room.onMessage(MESSAGE_TYPES.FX, (events: SimEvent[]) => this.#shakeForEvents(events));
    room.onMessage(
      MESSAGE_TYPES.DRAFT_OFFER,
      (payload: { offers: string[]; endsAtTick: number }) => {
        this.#currentDraftOffer = {
          offers: payload.offers,
          endsAtTick: payload.endsAtTick,
          picked: null,
        };
        this.#draftOffer.emit(this.#currentDraftOffer);
      },
    );

    const input = new CompositeInput([
      new KeyboardInput(),
      new GamepadInput(),
      ...this.#extraInputs,
    ]);
    input.attach();

    const resources: Resources = {
      app,
      surface,
      room,
      input,
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
      if (this.#roomInfo.hasListeners) {
        this.#roomInfo.emit(matchStateToRoomInfo(state, room.sessionId));
      }
      // A rematch moved the room on from `MatchOver`: take the results screen down.
      if (this.#resultShown && state.phase !== "MatchOver") {
        this.#resultShown = false;
        this.#matchResult.emit(null);
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
      this.#frameStats.record(ticker.elapsedMS);
      const plan = planSteps(this.#accumulatorMs, ticker.deltaMS, FIXED_DT_MS);
      this.#accumulatorMs = plan.accumulatorMs;
      for (let step = 0; step < plan.steps; step += 1) {
        const phase = this.#getPhase();
        if (phase.tag === "predicting") {
          this.#prevLocalPos = { ...phase.reconciler.visualPosition };
        }
        this.#fixedUpdate();
      }

      const alpha = this.#accumulatorMs / FIXED_DT_MS;
      const rects = playersToRects(room.state, this.#renderOverrides(alpha));
      view.sync(rects);

      if (this.#resolvedArena) {
        hazardView.sync(hazardsToRects(room.state, this.#resolvedArena.hazards));
      }
      this.#updateCamera(app, ticker.deltaMS / 1000);
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
    resources.input.detach();
    resources.surface.stop();
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
    return findArena(state.arenaId) ?? TESTBED_ARENA;
  }

  /** Seeds `#resolvedArena`/`#camera`/`ArenaView` the first tick
   *  `MatchState.arenaId` resolves to a real arena — idempotent, and safe
   *  to call from both right after join and every `onStateChange` until it
   *  sticks (mirrors `#ensureReconciler`'s own race-tolerant seeding). */
  #ensureArena(state: MatchState): void {
    const arena = findArena(state.arenaId);
    if (this.#resolvedArena || !arena) {
      return;
    }
    const phase = this.#getPhase();
    if (phase.tag !== "connected" && phase.tag !== "predicting") {
      return;
    }
    this.#resolvedArena = arena;
    this.#camera = new Camera(arena.bounds);
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

  /** Places the stage for this frame: the arena centered on the integer-scale surface, plus any
   *  shake (`Camera`, ADR 0002). Every layer is a child of `stage`, so one transform moves them
   *  together. A no-op until `#ensureArena` seeds `#camera` and the surface has a size. */
  #updateCamera(app: Application, dtSeconds: number): void {
    const camera = this.#camera;
    const phase = this.#getPhase();
    if (!camera || (phase.tag !== "connected" && phase.tag !== "predicting")) {
      return;
    }
    const layout = phase.resources.surface.layout;
    if (!layout) {
      return;
    }
    camera.update(dtSeconds);
    const transform = camera.transform(layout);
    app.stage.scale.set(transform.scale);
    app.stage.position.set(transform.x, transform.y);
  }

  #setConnection(state: ConnectionState): void {
    if (this.#getPhase().tag === "destroyed" || state === this.#connectionState) {
      return;
    }
    this.#connectionState = state;
    this.#connection.emit(state);
  }

  #fixedUpdate(): void {
    const phase = this.#getPhase();
    // No prediction and no input while the socket is down: the SDK would buffer the input and
    // flush a burst on reconnect, and the prediction would run ahead of a server that is not there.
    if (phase.tag !== "predicting" || this.#connectionState !== "connected") {
      return;
    }
    const { resources, reconciler } = phase;
    this.#seq += 1;
    const frame = { seq: this.#seq, bits: resources.input.sample() };
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
      return client.create<MatchState>(
        MATCH_ROOM_NAME,
        { mode: "private", arenaId: intent.arenaId },
        MatchState,
      );
    case "tutorial":
      return client.create<MatchState>(MATCH_ROOM_NAME, { mode: "tutorial" }, MatchState);
    case "practice":
      return client.create<MatchState>(
        MATCH_ROOM_NAME,
        {
          mode: "practice",
          botCount: intent.botCount,
          botTier: intent.tier,
          arenaId: intent.arenaId,
        },
        MatchState,
      );
    case "joinPrivate":
      return client.join<MatchState>(
        MATCH_ROOM_NAME,
        { mode: "private", code: intent.code },
        MatchState,
      );
    case "joinById":
      return client.joinById<MatchState>(intent.roomId, undefined, MatchState);
    case "reconnect":
      return client.reconnect<MatchState>(intent.token, MatchState);
  }
}
