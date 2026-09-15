import { MATCH_ROOM_NAME } from "@castle-clash/shared";
import { monitor } from "@colyseus/monitor";
import { defineRoom, defineServer, WebSocketTransport } from "colyseus";
import { registerHealthRoutes } from "./http.js";
import { MatchRoom } from "./rooms/MatchRoom.js";

export const server = defineServer({
  rooms: {
    [MATCH_ROOM_NAME]: defineRoom(MatchRoom),
  },
  transport: new WebSocketTransport(),
  express: (app) => {
    registerHealthRoutes(app);
    if (process.env.NODE_ENV !== "production") {
      app.use("/colyseus", monitor());
    }
  },
  greet: process.env.NODE_ENV !== "test",
});

const isEntrypoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntrypoint) {
  const port = Number(process.env.PORT ?? 2567);
  await server.listen(port);
  console.log(`castle-clash server listening on :${port}`);
}
