import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  checkLandingBundle,
  evaluateLighthouse,
  landingScripts,
  median,
  MAX_LANDING_JS_GZIP_BYTES,
} from "./web-quality.mjs";

const HTML = [
  '<link rel="modulepreload" href="/assets/entry.client-a.js"/>',
  '<link rel="modulepreload" href="/assets/home-b.js"/>',
  '<script src="/config.js"></script>',
  '<script type="module" async="">import("/assets/entry.client-a.js")</script>',
].join("\n");

describe("median", () => {
  it("takes the middle value, or the mean of the middle two", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("landingScripts", () => {
  it("lists preloaded modules relative to the build root and skips config.js", () => {
    expect(landingScripts(HTML)).toEqual(["assets/entry.client-a.js", "assets/home-b.js"]);
  });
});

describe("checkLandingBundle", () => {
  const files = { "assets/entry.client-a.js": "react()", "assets/home-b.js": "home()" };
  const read = (file) => files[file] ?? "";

  it("passes a lean landing bundle", () => {
    expect(checkLandingBundle(HTML, read).ok).toBe(true);
  });

  it("fails when Pixi is in the landing graph", () => {
    const result = checkLandingBundle(HTML, (file) =>
      file.includes("home") ? "new PixiJS.Application()" : "x",
    );
    expect(result.ok).toBe(false);
    expect(result.checks[0]).toMatchObject({ ok: false });
    expect(result.checks[0].detail).toContain("home-b.js");
  });

  it("fails when supabase-js itself is in a preloaded chunk, whatever the chunk is called", () => {
    const result = checkLandingBundle(HTML, (file) =>
      file.includes("home") ? "class GoTrueClient{}" : "x",
    );
    expect(result.checks[1]).toMatchObject({ ok: false });
  });

  it("does not flag a chunk that only imports our supabase wrapper lazily", () => {
    const result = checkLandingBundle(HTML, () => 'import("./supabase-c.js")');
    expect(result.checks[1]).toMatchObject({ ok: true });
  });

  it("fails when gzipped JS exceeds the budget", () => {
    // Random base64 barely compresses (~6 bits of entropy per char), so 2x the budget in
    // characters is comfortably over it once gzipped.
    const noise = randomBytes(MAX_LANDING_JS_GZIP_BYTES * 1.5).toString("base64");
    expect(gzipSync(noise).length).toBeGreaterThan(MAX_LANDING_JS_GZIP_BYTES);
    const result = checkLandingBundle(HTML, (file) => (file.includes("home") ? noise : "x"));
    expect(result.checks[2]).toMatchObject({ ok: false });
  });
});

function report({ perf, a11y, lcp }) {
  return {
    categories: { performance: { score: perf / 100 }, accessibility: { score: a11y / 100 } },
    audits: { "largest-contentful-paint": { numericValue: lcp } },
  };
}

describe("evaluateLighthouse", () => {
  it("passes when the medians meet every budget", () => {
    const result = evaluateLighthouse([
      report({ perf: 95, a11y: 100, lcp: 2400 }),
      report({ perf: 93, a11y: 100, lcp: 2450 }),
      report({ perf: 60, a11y: 100, lcp: 4000 }), // one bad run does not fail it
    ]);
    expect(result.ok).toBe(true);
  });

  it("fails on performance, accessibility or LCP independently", () => {
    expect(evaluateLighthouse([report({ perf: 85, a11y: 100, lcp: 2000 })]).ok).toBe(false);
    expect(evaluateLighthouse([report({ perf: 95, a11y: 90, lcp: 2000 })]).ok).toBe(false);
    expect(evaluateLighthouse([report({ perf: 95, a11y: 100, lcp: 2600 })]).ok).toBe(false);
  });
});
