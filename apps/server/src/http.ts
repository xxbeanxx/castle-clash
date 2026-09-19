import type { Application } from "express";

/** `isDraining` defaults to "never" so every existing caller/test that
 *  doesn't care about Phase 10's shutdown behavior keeps working unchanged
 *  — only `index.ts` passes the real one, from `shutdown.ts`. */
export function registerHealthRoutes(
  app: Application,
  isDraining: () => boolean = () => false,
  version?: string,
): void {
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", version });
  });

  app.get("/readyz", (_req, res) => {
    if (isDraining()) {
      res.status(503).json({ status: "draining" });
      return;
    }
    res.status(200).json({ status: "ready" });
  });
}
