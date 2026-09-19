/** A numeric env var, falling back to `fallback` when unset OR unparseable.
 *  Bare `Number(process.env.X ?? d)` turns a typo (`"abc"`) into `NaN`, and
 *  every limiter comparison against `NaN` is false — a bad value would
 *  silently disable the guardrail instead of failing safe. */
export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
