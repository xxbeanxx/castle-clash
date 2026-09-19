/** What `matches.server_version` records and `/healthz` reports. The image
 *  build stamps `SERVER_VERSION` in (`containerfile`'s `ARG`/`ENV`, fed from
 *  the release tag by `.github/workflows/docker.yaml`); a local `pnpm dev`
 *  run has none, so it gets an obviously-not-a-release marker. Read at call
 *  time, not module load, so a test can stub the env per case. */
export function serverVersion(): string {
  const raw = process.env["SERVER_VERSION"];
  return raw === undefined || raw === "" ? "0.0.0-dev" : raw;
}
