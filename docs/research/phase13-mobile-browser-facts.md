# Phase 13: mobile browser facts, and what is still unverified

Checked 2026-09-19 against MDN's browser-compat-data (`mdn/browser-compat-data`, `main`, fetched as raw
JSON: `api/Element.json`, `api/Document.json`, `api/ScreenOrientation.json`,
`manifests/webapp/display.json`, `manifests/webapp/orientation.json`). No real device was used.

## Verified (from the compat data)

| Fact                                                                                                                                                                                                                                               | Consequence in the code                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Element.requestFullscreen` / `document.fullscreenEnabled` on **iOS Safari**: since 16.4, **iPad only, not iPhone**; iPad shows an overlay button that cannot be disabled and swiping down exits. (Prefixed `webkit` from iOS 12, also iPad only.) | The Fullscreen button is shown only when `document.fullscreenEnabled === true`, so it is absent on iPhone. On iPad it works but is not a "no chrome" guarantee. |
| `screen.orientation.lock()`: **not supported on Safari or iOS Safari**; Chrome Android since 38; MDN notes it is typically only enabled on mobile and in fullscreen.                                                                               | The lock is best-effort after entering fullscreen, every failure swallowed. It cannot be what guarantees landscape.                                             |
| Manifest `display: "standalone"`: iOS Safari since 11.3 (home-screen launch without browser chrome); `fullscreen` and `minimal-ui`: not supported by Safari, and the spec falls back `fullscreen` -> `standalone` -> `minimal-ui` -> `browser`.    | The manifest asks for `standalone`, the biggest practical iOS win.                                                                                              |
| Manifest `orientation`: **not supported by Safari or iOS Safari**; Firefox Android 79+, Chrome Android supported.                                                                                                                                  | The manifest declares `landscape` (Android honors it); iOS ignores it, so the CSS rotate prompt in portrait is the only iOS guarantee.                          |

The manifest `<link>` is added by JS after `load`, not in the static head: a head link measured +~105 ms landing LCP (2560 vs 2455 ms, same build, alternating Lighthouse 12.8.2 runs), over the 2500 ms budget. Chrome and iOS read the DOM link when they need it; unverified on a real device (checklist item 10).

Also checked by hand against the built image: nginx's stock `mime.types` has no `webmanifest`, so
`/manifest.webmanifest` was served as `application/octet-stream`. `docker/nginx.conf` now serves it as
`application/manifest+json` (a `default_type` in its own location; a `types {}` block would replace
the whole table).

## Not verified (goes on the real-device checklist)

- That an iOS home-screen launch really has no browser chrome with this manifest, and whether iOS
  also wants `apple-mobile-web-app-capable` (both are set; the redundancy is deliberate and untested).
- `viewport-fit=cover` is **not** set. Without it `env(safe-area-inset-*)` are 0 and the browser
  insets content itself in landscape; with it the canvas can run behind the notch but every page then
  needs its own inset handling. The touch overlay already pads with `env()`, so switching later is a
  one-line meta change. Decide from a notched device.
- `navigator.vibrate` (used for a tiny button haptic): believed absent on iOS Safari, present on
  Android Chrome. Not checked against the data; the call is optional (`?.`) either way.
- Whether `touch-action: none` on the game surface prevents pinch/double-tap zoom on iOS Safari (iOS
  has historically ignored `user-scalable=no`; `touch-action` support there is recalled, not checked).
- That an Android install prompt appears (needs the icons and a service worker or, in newer Chrome,
  only the manifest; no service worker is registered, on purpose: offline play is meaningless for an
  online game).
- Real thumb reach and control feel on any phone.
