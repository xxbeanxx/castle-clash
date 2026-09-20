import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";

import "./app.css";
import { pageMeta } from "./meta.js";
import { Brand } from "./ui/Brand.js";
import { Button, ButtonLink } from "./ui/kit/index.js";

/**
 * Links the web app manifest after the page has loaded, not in the static `<head>`. A manifest
 * `<link>` in the head costs the landing page ~100 ms of simulated-throttling LCP (measured: 2560 ms
 * with it, 2455 ms without, same build, alternating Lighthouse runs), which is over the 2500 ms
 * budget. Chrome's installability check and iOS's "Add to Home Screen" both read the DOM's manifest
 * link when they need it, so adding it late still works.
 */
function DeferredManifestLink() {
  useEffect(() => {
    const add = () => {
      if (document.querySelector('link[rel="manifest"]')) {
        return;
      }
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.webmanifest";
      document.head.appendChild(link);
    };
    if (document.readyState === "complete") {
      add();
      return;
    }
    window.addEventListener("load", add, { once: true });
    return () => window.removeEventListener("load", add);
  }, []);
  return null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#16130f" />
        {/* "Add to Home Screen" launches without browser chrome. iOS ignores the manifest's
            `orientation`, so the rotate prompt on /play still matters there. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Castle Clash" />
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
        <DeferredManifestLink />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** Site-wide default; each route's own `meta` replaces it. Also what the SPA shell (`index.html`) carries. */
export const meta = () => pageMeta({ path: "/" });

/** Icons, plus a preload of the two faces every page paints first so text swaps in without a visible reflow. */
export const links = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  {
    rel: "preload",
    href: "/fonts/pixelify-sans-latin-700-normal.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous" as const,
  },
  {
    rel: "preload",
    href: "/fonts/alegreya-sans-latin-400-normal.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous" as const,
  },
];

/** Shown while the initial `clientLoader`s run, before any route has rendered. */
export function HydrateFallback() {
  return (
    <div className="cc-splash" role="status" aria-live="polite">
      <Brand />
      <p>Raising the drawbridge…</p>
    </div>
  );
}

/**
 * Last-resort boundary for anything a route throws (a failed loader, a render
 * bug). Deliberately self-contained: it can't assume the site layout or a
 * session, and offers the two things that always work, retry and go home.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const isResponse = isRouteErrorResponse(error);
  const title = isResponse && error.status === 404 ? "Page not found" : "Something went wrong";
  const detail = isResponse
    ? `${error.status} ${error.statusText}`.trim()
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred.";

  return (
    <main className="cc-page cc-page--narrow" id="main">
      <Brand />
      <h1>{title}</h1>
      <p className="cc-alert" role="alert">
        {detail}
      </p>
      <div className="cc-row">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try again
        </Button>
        <ButtonLink to="/">Back to the keep</ButtonLink>
      </div>
    </main>
  );
}

export default function App() {
  return <Outlet />;
}
