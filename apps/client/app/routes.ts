import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("lobby", "routes/lobby.tsx"),
  route("play/:roomId", "routes/play.$roomId.tsx"),
] satisfies RouteConfig;
