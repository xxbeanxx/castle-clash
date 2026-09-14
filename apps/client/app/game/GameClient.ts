import { MatchState } from "@castle-clash/shared";
import { Client, type Room } from "@colyseus/sdk";
import { Application } from "pixi.js";
import { PlayerRectsView } from "./render/PlayerRects.js";
import { playersToRects } from "./viewmodel/playersToRects.js";

export class GameClient {
  #app: Application | undefined;
  #room: Room<unknown, MatchState> | undefined;

  async start(container: HTMLElement, roomUrl: string): Promise<void> {
    const app = new Application();
    await app.init({ resizeTo: container, backgroundColor: 0x1a1a1a });
    container.appendChild(app.canvas);

    const view = new PlayerRectsView(app.stage);
    const client = new Client(roomUrl);
    const room = await client.joinOrCreate<MatchState>("match", undefined, MatchState);

    this.#app = app;
    this.#room = room;

    app.ticker.add(() => view.sync(playersToRects(room.state)));
  }

  async destroy(): Promise<void> {
    await this.#room?.leave();
    this.#room = undefined;

    this.#app?.destroy(true, { children: true });
    this.#app = undefined;
  }
}
