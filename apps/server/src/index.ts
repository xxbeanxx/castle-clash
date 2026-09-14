import { defineRoom, defineServer, WebSocketTransport } from "colyseus";
import { registerHealthRoutes } from "./http.js";
import { MatchRoom } from "./rooms/MatchRoom.js";

export const server = defineServer({
  rooms: {
    match: defineRoom(MatchRoom),
  },
  transport: new WebSocketTransport(),
  express: (app) => {
    registerHealthRoutes(app);
  },
  greet: process.env.NODE_ENV !== "test",
});

const isEntrypoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntrypoint) {
  const port = Number(process.env.PORT ?? 2567);
  await server.listen(port);
  console.log(`castle-clash server listening on :${port}`);
}
