import { hashSeed, MatchState, PlayerState, TICK_RATE } from "@castle-clash/shared";
import { type Client, Room } from "colyseus";
import { IntervalTickDriver, type TickDriver } from "./TickDriver.js";

const SPAWN_X_STEP = 120;
const SPAWN_Y = 300;

export interface MatchRoomOptions {
  tickDriver?: TickDriver;
}

export class MatchRoom extends Room<{ state: MatchState }> {
  #tickDriver!: TickDriver;

  onCreate(options: MatchRoomOptions = {}): void {
    this.setState(new MatchState());
    this.#tickDriver = options.tickDriver ?? new IntervalTickDriver(this, TICK_RATE);
    this.#tickDriver.start(() => this.#tick());
  }

  onJoin(client: Client): void {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.x = SPAWN_X_STEP * (this.state.players.size + 1);
    player.y = SPAWN_Y;
    player.colorSeed = hashSeed(client.sessionId);
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }

  onDispose(): void {
    this.#tickDriver.stop();
  }

  #tick(): void {
    this.state.tick += 1;
  }
}
