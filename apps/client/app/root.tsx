import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Castle Clash</title>
        <Meta />
        <Links />
        {/*
          Rendered by the client container's entrypoint.sh from GAME_SERVER_URL/
          SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY env vars (see config/runtime.ts).
          A plain (non-module) script here runs synchronously during head parsing,
          before <Scripts/>'s deferred module scripts — so window.__CONFIG__ is
          always set before the app bundle reads it. 404s harmlessly in
          `pnpm dev`, which never serves this file; runtime.ts falls back to a
          local dev default in that case.
        */}
        <script src="/config.js" />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <p>Loading…</p>;
}

export default function App() {
  return <Outlet />;
}
