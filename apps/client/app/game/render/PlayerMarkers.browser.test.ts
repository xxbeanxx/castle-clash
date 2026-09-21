import { PLAYER_HEIGHT, PLAYER_WIDTH } from "@castle-clash/shared";
import { Application, Container, type Sprite } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnightRect } from "../viewmodel/playersToRects.js";
import { PlayerMarkers } from "./PlayerMarkers.js";

const knight = (over: Partial<KnightRect> = {}): KnightRect => ({
  id: "p1",
  x: 100,
  y: 200,
  tint: 0x3a6fe0,
  action: "Idle",
  actionTick: 0,
  attackKind: "",
  weapon: "sword",
  facing: 1,
  vy: 0,
  name: "Guest-1",
  isLocal: false,
  ...over,
});

describe("PlayerMarkers", () => {
  let app: Application;
  let ground: Container;
  let plates: Container;

  beforeEach(async () => {
    app = new Application();
    await app.init({ width: 200, height: 200 });
    ground = new Container();
    plates = new Container();
    app.stage.addChild(ground, plates);
  });

  afterEach(() => {
    app.destroy(true, { children: true });
  });

  it("gives every player a ground marker and a plate, and only the local one an arrow", () => {
    const markers = new PlayerMarkers(ground, plates);
    markers.sync([knight({ id: "a", isLocal: true }), knight({ id: "b", x: 300 })]);
    expect(ground.children).toHaveLength(2);
    expect(plates.children).toHaveLength(3);
    markers.destroy();
  });

  it("puts the marker under the feet and the plate above the head, centred on the body", () => {
    const markers = new PlayerMarkers(ground, plates);
    markers.sync([knight()]);
    const [marker] = ground.children as [Sprite];
    const [plate] = plates.children as [Sprite];
    expect(marker.position.x).toBe(100 + PLAYER_WIDTH / 2);
    expect(marker.position.y).toBeGreaterThanOrEqual(200 + PLAYER_HEIGHT);
    expect(plate.position.x).toBe(100 + PLAYER_WIDTH / 2);
    expect(plate.position.y).toBeLessThan(200);
    markers.destroy();
  });

  it("floats the local player's plate a text row above another player's at the same height", () => {
    const markers = new PlayerMarkers(ground, plates);
    markers.sync([knight({ id: "me", isLocal: true }), knight({ id: "them" })]);
    const [mine, , theirs] = plates.children as Sprite[]; // me: plate, arrow; them: plate
    expect(mine!.position.y).toBeLessThan(theirs!.position.y - 12);
    markers.destroy();
  });

  it("hides a dead knight's markers, and drops the markers of a player who left", () => {
    const markers = new PlayerMarkers(ground, plates);
    markers.sync([knight({ id: "a" }), knight({ id: "b" })]);
    markers.sync([knight({ id: "a", action: "Dead" })]);
    expect(ground.children).toHaveLength(1);
    expect((ground.children[0] as Sprite).visible).toBe(false);
    expect((plates.children[0] as Sprite).visible).toBe(false);
    markers.destroy();
  });

  it("repaints when the name arrives or the colour changes, and not otherwise", () => {
    const markers = new PlayerMarkers(ground, plates);
    markers.sync([knight({ name: "" })]);
    const empty = (plates.children[0] as Sprite).texture;
    markers.sync([knight({ name: "" })]);
    expect((plates.children[0] as Sprite).texture).toBe(empty);

    markers.sync([knight({ name: "Sir Aldric" })]);
    expect((plates.children[0] as Sprite).texture).not.toBe(empty);
    markers.destroy();
  });
});
