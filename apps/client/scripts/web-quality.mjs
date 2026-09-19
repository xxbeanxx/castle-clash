#!/usr/bin/env node
// Web-quality gates for the public landing page (v2 plan, Phase 11):
//
//   node scripts/web-quality.mjs bundle build/client
//   node scripts/web-quality.mjs lighthouse lh-1.json lh-2.json lh-3.json
//
// `bundle` reads the prerendered `/` (build/client/index.html) and fails if the
// JavaScript it loads up front includes PixiJS or the Supabase client, or grows
// past a gzip budget. `lighthouse` takes Lighthouse JSON reports (one per run),
// takes the median of each metric, and fails if a budget is missed. Both print
// every check and exit non-zero on any failure.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** Lighthouse budgets, from the v2 plan's Phase 11 testing strategy. */
export const LIGHTHOUSE_BUDGETS = {
  performance: { min: 90 },
  accessibility: { min: 95 },
  lcpMs: { max: 2500 },
};

/** Gzipped bytes of JS the landing page may load before first interaction. */
export const MAX_LANDING_JS_GZIP_BYTES = 220 * 1024;

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The JS files `index.html` loads or preloads, as paths relative to the build root. */
export function landingScripts(html) {
  const found = new Set();
  for (const match of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
    found.add(match[1]);
  }
  for (const match of html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)) {
    // config.js is rendered per environment at container start, not a bundle.
    if (!match[1].endsWith("/config.js")) {
      found.add(match[1]);
    }
  }
  return [...found].map((href) => href.replace(/^\//, ""));
}

/** Returns `{ checks: [{name, ok, detail}], ok }`. `read(path)` returns a file's contents as a string. */
export function checkLandingBundle(html, read) {
  const scripts = landingScripts(html);
  const checks = [];

  const pixi = scripts.filter((file) => /pixi/i.test(read(file)));
  checks.push({
    name: "no PixiJS on /",
    ok: pixi.length === 0,
    detail: pixi.length === 0 ? `${scripts.length} scripts checked` : `found in ${pixi.join(", ")}`,
  });

  // `GoTrueClient` is supabase-js's own auth class; app chunks that merely
  // import() our wrapper never contain it, so a hit means the library itself
  // is in what `/` loads up front.
  const supabase = scripts.filter((file) => /GoTrueClient/.test(read(file)));
  checks.push({
    name: "supabase-js is not loaded up front on /",
    ok: supabase.length === 0,
    detail: supabase.length === 0 ? "loaded on demand" : `preloaded: ${supabase.join(", ")}`,
  });

  const gzipBytes = scripts.reduce((total, file) => total + gzipSync(read(file)).length, 0);
  checks.push({
    name: `landing JS <= ${Math.round(MAX_LANDING_JS_GZIP_BYTES / 1024)} KiB gzipped`,
    ok: gzipBytes <= MAX_LANDING_JS_GZIP_BYTES,
    detail: `${(gzipBytes / 1024).toFixed(1)} KiB`,
  });

  return { checks, ok: checks.every((check) => check.ok) };
}

/** `reports` are parsed Lighthouse JSON results. */
export function evaluateLighthouse(reports, budgets = LIGHTHOUSE_BUDGETS) {
  const score = (report, category) => (report.categories[category]?.score ?? 0) * 100;
  const performance = median(reports.map((report) => score(report, "performance")));
  const accessibility = median(reports.map((report) => score(report, "accessibility")));
  const lcpMs = median(
    reports.map((report) => report.audits["largest-contentful-paint"]?.numericValue ?? Infinity),
  );

  const checks = [
    {
      name: `performance >= ${budgets.performance.min}`,
      ok: performance >= budgets.performance.min,
      detail: performance.toFixed(0),
    },
    {
      name: `accessibility >= ${budgets.accessibility.min}`,
      ok: accessibility >= budgets.accessibility.min,
      detail: accessibility.toFixed(0),
    },
    {
      name: `LCP <= ${budgets.lcpMs.max} ms`,
      ok: lcpMs <= budgets.lcpMs.max,
      detail: `${Math.round(lcpMs)} ms (median of ${reports.length})`,
    },
  ];
  return { checks, ok: checks.every((check) => check.ok) };
}

function print({ checks, ok }) {
  for (const check of checks) {
    console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}: ${check.detail}`);
  }
  return ok;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [command, ...args] = process.argv.slice(2);
  let ok = false;
  if (command === "bundle" && args[0]) {
    const root = args[0];
    const html = readFileSync(join(root, "index.html"), "utf8");
    ok = print(checkLandingBundle(html, (file) => readFileSync(join(root, file), "utf8")));
  } else if (command === "lighthouse" && args.length > 0) {
    const reports = args.map((file) => JSON.parse(readFileSync(file, "utf8")));
    ok = print(evaluateLighthouse(reports));
  } else {
    console.error(
      `usage: ${dirname(process.argv[1])}/web-quality.mjs bundle <buildDir> | lighthouse <report.json...>`,
    );
  }
  process.exit(ok ? 0 : 1);
}
