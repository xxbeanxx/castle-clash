import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Everything with the site header and footer.
  layout("layouts/SiteLayout.tsx", [
    index("routes/home.tsx"),
    route("login", "routes/login.tsx"),
    route("auth/callback", "routes/auth.callback.tsx"),
    route("lobby", "routes/lobby.tsx"),
    route("loadout", "routes/loadout.tsx"),
    route("stats", "routes/stats.tsx"),
    route("leaderboard", "routes/leaderboard.tsx"),
    route("how-to-play", "routes/how-to-play.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("terms", "routes/terms.tsx"),
    route("about", "routes/about.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
  // Full-bleed: the canvas owns the viewport, so no site chrome.
  route("play/:roomId", "routes/play.$roomId.tsx"),
] satisfies RouteConfig;
