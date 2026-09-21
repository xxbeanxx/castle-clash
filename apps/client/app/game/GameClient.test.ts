import { afterEach, describe, expect, it, vi } from "vitest";

function fakeSchemaPlayer(overrides: Partial<Record<string, number | boolean>> = {}) {
  return {
    x: 200,
    y: 600,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    coyoteTicks: 0,
    jumpBufferTicks: 0,
    dropThroughTicks: 0,
    lastProcessedSeq: 0,
    // `playersToRects` (Phase 9) reads `.cosmetics.helmetId`/`.capeId` off
    // every player unconditionally, same as a real `PlayerState` schema
    // instance always has a `cosmetics` field — this fake needs one too,
    // even though nothing in this file exercises cosmetics rendering.
    cosmetics: { helmetId: "helmet-none", capeId: "cape-none", weaponStyleId: "weaponStyle-none" },
    ...overrides,
  };
}

const { mockApp, mockRoom, joinOrCreate, playersMap } = vi.hoisted(() => {
  const mockApp = {
    init: vi.fn().mockResolvedValue(undefined),
    canvas: document.createElement("canvas"),
    stage: { addChild: vi.fn() },
    ticker: { add: vi.fn() },
    destroy: vi.fn(),
  };
  // A minimal stand-in for MatchState.players — just enough for start()'s
  // `.get(...)` lookup and the render loop's `playersToRects(...)`, which
  // only calls `.forEach`.
  const playersMap = new Map<string, unknown>();
  const mockRoom = {
    sessionId: "local-1",
    roomId: "room-1",
    state: {
      tick: 0,
      players: {
        get: (id: string) => playersMap.get(id),
        forEach: (cb: (player: unknown, id: string) => void) => playersMap.forEach(cb),
      },
    },
    send: vi.fn(),
    leave: vi.fn().mockResolvedValue(undefined),
    onStateChange: vi.fn(),
    onMessage: vi.fn(),
    onDrop: vi.fn(),
    onReconnect: vi.fn(),
    onLeave: vi.fn(),
  };
  const joinOrCreate = vi.fn().mockResolvedValue(mockRoom);
  return { mockApp, mockRoom, joinOrCreate, playersMap };
});

vi.mock("pixi.js", () => ({
  Application: vi.fn().mockImplementation(function Application() {
    return mockApp;
  }),
  Container: vi.fn().mockImplementation(function Container() {
    return { addChild: vi.fn() };
  }),
  Graphics: vi.fn().mockImplementation(function Graphics() {
    const graphics = {
      position: { set: vi.fn() },
      destroy: vi.fn(),
      clear: vi.fn().mockReturnThis(),
      rect: vi.fn().mockReturnThis(),
      fill: vi.fn().mockReturnThis(),
    };
    return graphics;
  }),
  Sprite: vi.fn().mockImplementation(function Sprite() {
    return { position: { set: vi.fn() }, destroy: vi.fn() };
  }),
  Texture: { WHITE: {} },
}));

// The real surface needs ResizeObserver/matchMedia and a laid-out container, none of which jsdom
// has; it is covered by surface.test.ts (pure) and the Playwright e2e specs (real browser).
vi.mock("./render/SurfaceController.js", () => ({
  PIXEL_ART_INIT: {},
  nearestTextureScaling: vi.fn(),
  SurfaceController: vi.fn().mockImplementation(function SurfaceController() {
    return { start: vi.fn(), stop: vi.fn(), layout: null };
  }),
}));

// Effects and name plates paint canvases (`ImageData`, `Texture.from`), which jsdom lacks; they are
// covered by `Fx.browser.test.ts`, `PlayerMarkers.browser.test.ts` and the e2e suite.
vi.mock("./render/Fx.js", () => ({
  Fx: vi.fn().mockImplementation(function Fx() {
    return { spawn: vi.fn(), ambient: vi.fn(), update: vi.fn(), destroy: vi.fn(), active: 0 };
  }),
}));
vi.mock("./render/PlayerMarkers.js", () => ({
  PlayerMarkers: vi.fn().mockImplementation(function PlayerMarkers() {
    return { sync: vi.fn(), destroy: vi.fn() };
  }),
}));

vi.mock("@colyseus/sdk", () => ({
  Client: vi.fn().mockImplementation(function Client() {
    return { joinOrCreate };
  }),
}));

const { GameClient } = await import("./GameClient.js");

describe("GameClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockApp.init.mockResolvedValue(undefined);
    joinOrCreate.mockResolvedValue(mockRoom);
    mockRoom.leave.mockResolvedValue(undefined);
    playersMap.clear();
  });

  it("tears down cleanly when destroy() runs before app.init() resolves", async () => {
    const container = document.createElement("div");
    const client = new GameClient();

    const starting = client.start(container, "ws://example.test");
    await client.destroy();
    await starting;

    expect(container.children.length).toBe(0);
    expect(mockApp.destroy).toHaveBeenCalled();
    expect(joinOrCreate).not.toHaveBeenCalled();
  });

  // GameCanvas calls start() only after an async getAccessToken(), so under React StrictMode (and
  // when a user navigates away quickly) the effect's cleanup runs destroy() BEFORE start(). A
  // start() that then ran anyway joined the room as the same user a second time ("already
  // connected to this match" / "seat reservation expired") and left the first seat dangling.
  it("does nothing when start() is called after destroy()", async () => {
    const container = document.createElement("div");
    const client = new GameClient();

    await client.destroy();
    await client.start(container, "ws://example.test");

    expect(mockApp.init).not.toHaveBeenCalled();
    expect(joinOrCreate).not.toHaveBeenCalled();
    expect(container.children.length).toBe(0);
  });

  it("tears down cleanly when destroy() runs before joinOrCreate() resolves", async () => {
    const container = document.createElement("div");
    const client = new GameClient();

    const starting = client.start(container, "ws://example.test");
    // Let app.init() resolve and joinOrCreate() get called, but race destroy()
    // against joinOrCreate() itself.
    await Promise.resolve();
    await Promise.resolve();
    await client.destroy();
    await starting;

    expect(mockRoom.leave).toHaveBeenCalled();
    expect(mockApp.destroy).toHaveBeenCalled();
  });

  it("lazily creates the reconciler from a later patch when the local player wasn't in the initial state", async () => {
    const container = document.createElement("div");
    const client = new GameClient();

    // The local player is NOT yet in room.state when joinOrCreate() resolves
    // — the race that silently stranded #fixedUpdate() forever.
    await client.start(container, "ws://example.test");

    playersMap.set(mockRoom.sessionId, fakeSchemaPlayer());
    const onStateChangeCallback = mockRoom.onStateChange.mock.calls[0]![0] as (
      state: unknown,
    ) => void;
    onStateChangeCallback(mockRoom.state);

    const tickerCallback = mockApp.ticker.add.mock.calls[0]![0] as (ticker: {
      deltaMS: number;
    }) => void;
    tickerCallback({ deltaMS: 1000 / 60 });

    expect(mockRoom.send).toHaveBeenCalled();

    await client.destroy();
  });

  it("does not tear down a normal, undisturbed start()", async () => {
    const container = document.createElement("div");
    const client = new GameClient();

    await client.start(container, "ws://example.test");

    expect(container.children.length).toBe(1);
    expect(mockApp.destroy).not.toHaveBeenCalled();

    await client.destroy();
    expect(mockRoom.leave).toHaveBeenCalled();
    expect(mockApp.destroy).toHaveBeenCalled();
  });
});
