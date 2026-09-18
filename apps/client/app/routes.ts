import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("lobby", "routes/lobby.tsx"),
  route("play/:roomId", "routes/play.$roomId.tsx"),
  route("loadout", "routes/loadout.tsx"),
  route("stats", "routes/stats.tsx"),
  route("leaderboard", "routes/leaderboard.tsx"),
] satisfies RouteConfig;
