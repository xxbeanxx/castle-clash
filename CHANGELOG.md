# Changelog

## [1.4.0](https://github.com/xxbeanxx/castle-clash/compare/v1.3.0...v1.4.0) (2026-09-21)


### Features

* **client:** animated Fantasy Knight, recoloured per player (Phase 15.0 slice; the part of [#74](https://github.com/xxbeanxx/castle-clash/issues/74) that missed the merge) ([#76](https://github.com/xxbeanxx/castle-clash/issues/76)) ([5acddfb](https://github.com/xxbeanxx/castle-clash/commit/5acddfbf0278b81f097096f67283311685353269))
* **client:** Phase 15.0 art bible, licence log, knight animation mapping ([#74](https://github.com/xxbeanxx/castle-clash/issues/74)) ([113806d](https://github.com/xxbeanxx/castle-clash/commit/113806db64c2dd3ba183682b215ee31c20f8f995))
* **client:** practice, backfill offer, results with Play again (Phase 14, stacked on [#68](https://github.com/xxbeanxx/castle-clash/issues/68)) ([#70](https://github.com/xxbeanxx/castle-clash/issues/70)) ([a9a1768](https://github.com/xxbeanxx/castle-clash/commit/a9a17684eb00141d01ff576ef570ba1b5473e833))
* first-run tutorial with a training dummy (Phase 14 step 4, stacked on [#70](https://github.com/xxbeanxx/castle-clash/issues/70)) ([#71](https://github.com/xxbeanxx/castle-clash/issues/71)) ([3cc64bd](https://github.com/xxbeanxx/castle-clash/commit/3cc64bd653fabb198b5d9bea7896c97a9cd5d990))
* **server:** bots in MatchRoom, practice, backfill, rematch (Phase 14 steps 1-3, 6) ([#68](https://github.com/xxbeanxx/castle-clash/issues/68)) ([7e500a8](https://github.com/xxbeanxx/castle-clash/commit/7e500a8a28d889955af4cecc2914f1a8fb88d22e))
* **shared:** bot brain with three difficulty tiers (Phase 14 step 1) ([#64](https://github.com/xxbeanxx/castle-clash/issues/64)) ([542eb29](https://github.com/xxbeanxx/castle-clash/commit/542eb29e43a76f9cfa3cf8a3219fa2981566c346))
* sudden death applies a damage ramp and a bleed (Phase 14 step 7) ([#65](https://github.com/xxbeanxx/castle-clash/issues/65)) ([d1951ba](https://github.com/xxbeanxx/castle-clash/commit/d1951ba6fead910d8d0619c5d3e9fa7cc2893f06))


### Bug Fixes

* **client:** GameClient.start() no longer runs after destroy() (dev blank canvas) ([#75](https://github.com/xxbeanxx/castle-clash/issues/75)) ([60d1d1b](https://github.com/xxbeanxx/castle-clash/commit/60d1d1b1a6652166e161bbaae6f1e13a20470804))
* **shared:** bots reach a standing player from any spawn (Phase 14) ([#69](https://github.com/xxbeanxx/castle-clash/issues/69)) ([d1c5d6a](https://github.com/xxbeanxx/castle-clash/commit/d1c5d6ae9a5097e5c50fd04cb20dc6254c8c4c8c))

## [1.3.0](https://github.com/xxbeanxx/castle-clash/compare/v1.2.0...v1.3.0) (2026-09-20)


### Features

* **client:** catch-up clamp, reconnect overlay, gamepad, frame stats (Phase 13 steps 10-12) ([#59](https://github.com/xxbeanxx/castle-clash/issues/59)) ([667d058](https://github.com/xxbeanxx/castle-clash/commit/667d05821fe658a4f2bab7682b383ba6c9c6c3e9))
* **client:** InputSource/CompositeInput and the lost-tap latch (Phase 13 steps 4-5) ([#55](https://github.com/xxbeanxx/castle-clash/issues/55)) ([4c65c8a](https://github.com/xxbeanxx/castle-clash/commit/4c65c8af0af9fa0ba3c2959feb04310d6032294a))
* **client:** landscape-phone UI fixes, device Playwright projects, checklist (Phase 13 step 9) ([#60](https://github.com/xxbeanxx/castle-clash/issues/60)) ([0380f61](https://github.com/xxbeanxx/castle-clash/commit/0380f618beec7dbe3d1a8b185e1e7cce7cea35d3))
* **client:** rotate prompt, fullscreen button, PWA manifest (Phase 13 step 8) ([#58](https://github.com/xxbeanxx/castle-clash/issues/58)) ([e08349b](https://github.com/xxbeanxx/castle-clash/commit/e08349bcb403e3e856d1dc3e495c526adfe9b714))
* **client:** TouchInput and TouchControls overlay (Phase 13 steps 6-7) ([#57](https://github.com/xxbeanxx/castle-clash/issues/57)) ([c0a53eb](https://github.com/xxbeanxx/castle-clash/commit/c0a53ebff4ba96cf0709d12944efdc2afbbd655b))

## [1.2.0](https://github.com/xxbeanxx/castle-clash/compare/v1.1.0...v1.2.0) (2026-09-19)


### Features

* **client:** account page, account menu, name prompt, guest nudge (Phase 12 steps 7-9) ([#49](https://github.com/xxbeanxx/castle-clash/issues/49)) ([5231a19](https://github.com/xxbeanxx/castle-clash/commit/5231a196fd9218fb4de635dd60a389c67273a05f))
* **client:** app shell, ErrorBoundary, 404, branded splash (Phase 11 step 3) ([#40](https://github.com/xxbeanxx/castle-clash/issues/40)) ([0e2309c](https://github.com/xxbeanxx/castle-clash/commit/0e2309c105fdd4e67df7a6b625e516ccd8dbe2f2))
* **client:** link Google to a guest, /auth/callback, next survives OAuth (Phase 12 step 5) ([#48](https://github.com/xxbeanxx/castle-clash/issues/48)) ([0bd98fc](https://github.com/xxbeanxx/castle-clash/commit/0bd98fc122c1d65dedffdd0a1e7cd5a02122cc91))
* **client:** static pages, metadata, prerender (Phase 11 steps 5-6) ([#42](https://github.com/xxbeanxx/castle-clash/issues/42)) ([6146193](https://github.com/xxbeanxx/castle-clash/commit/6146193b7ca3571e290b720e39cea89b7ff66734))
* **client:** UI kit, design tokens, dark theme, self-hosted fonts (Phase 11 step 2) ([#37](https://github.com/xxbeanxx/castle-clash/issues/37)) ([6b05cff](https://github.com/xxbeanxx/castle-clash/commit/6b05cfffb6003f7db6902b3c47a4124fefd3abd7))
* **infra:** Google sign-in setup path (Phase 12 steps 1-4) ([#47](https://github.com/xxbeanxx/castle-clash/issues/47)) ([8155d1d](https://github.com/xxbeanxx/castle-clash/commit/8155d1d691ebe86be9aefb1740cc5a26204b8bb0))
* **infra:** Terraform owns the Supabase auth settings (D2) ([#51](https://github.com/xxbeanxx/castle-clash/issues/51)) ([c78fc57](https://github.com/xxbeanxx/castle-clash/commit/c78fc576f97484935bab08c6e3d39282e22f278d))
* landing page and public GET /stats (Phase 11 step 4) ([#41](https://github.com/xxbeanxx/castle-clash/issues/41)) ([ee2ff5f](https://github.com/xxbeanxx/castle-clash/commit/ee2ff5fc0841b12764a874be58478be7e32649fe))
* Play hub, ?next= redirects, public leaderboard, web-quality gates (Phase 11 steps 7-8) ([#43](https://github.com/xxbeanxx/castle-clash/issues/43)) ([e8d484b](https://github.com/xxbeanxx/castle-clash/commit/e8d484bdee765960283c5be1ad03984deb8ab2e4))
* player display names (Phase 12 step 8, server/shared/db) ([#46](https://github.com/xxbeanxx/castle-clash/issues/46)) ([6c817a5](https://github.com/xxbeanxx/castle-clash/commit/6c817a5fef207df9efe7d375c7be4116c95af84f))

## [1.1.0](https://github.com/xxbeanxx/castle-clash/compare/v1.0.0...v1.1.0) (2026-09-19)


### Features

* **infra:** manage Azure, GitHub, Supabase and all secrets with Terraform ([#15](https://github.com/xxbeanxx/castle-clash/issues/15)) ([0005056](https://github.com/xxbeanxx/castle-clash/commit/00050561b4ea67d875d2ddaf4b3f1547e6377df9))


### Bug Fixes

* **ci:** build release images for linux/amd64 only ([#30](https://github.com/xxbeanxx/castle-clash/issues/30)) ([55b0833](https://github.com/xxbeanxx/castle-clash/commit/55b0833b06df9338323637c071a00cc469805ca8))
* **ci:** secrets: inherit so the production environment's secrets reach the deploy job ([#32](https://github.com/xxbeanxx/castle-clash/issues/32)) ([772ffce](https://github.com/xxbeanxx/castle-clash/commit/772ffce954929805530982ab8f0ffd36623d4d8f))
* **smoke:** identify the client by its title, not a &lt;div&gt; ([#33](https://github.com/xxbeanxx/castle-clash/issues/33)) ([f0b4c54](https://github.com/xxbeanxx/castle-clash/commit/f0b4c543c41e28d9492f104355e3952a65f6db3e))

## 1.0.0 (2026-09-19)


### Features

* Phase 10 deploy pipeline for Azure Container Apps ([628cabc](https://github.com/xxbeanxx/castle-clash/commit/628cabc9ef8e54d3fddd5eca0cdbe0fee6b68ce3))


### Bug Fixes

* address code-review findings from the Phase 10 deploy review ([247165c](https://github.com/xxbeanxx/castle-clash/commit/247165cf0d68a3bd95303fa61ad9675802a818eb))
* **build:** pass VITE_E2E through turbo so the e2e image has the debug hook ([5d6388b](https://github.com/xxbeanxx/castle-clash/commit/5d6388b75a4779848b89cb30679f2deeb6d150ee))
* **ci:** give the containers smoke job a real local Supabase ([88288c9](https://github.com/xxbeanxx/castle-clash/commit/88288c9aca24b9e9c4ad8be5e7bdf673e8c3d0d9))
* **ci:** give the containers smoke job a real local Supabase ([461f275](https://github.com/xxbeanxx/castle-clash/commit/461f275ee8c136366e55008819609df605861682))
* **ci:** give the e2e job a real local Supabase ([dac5420](https://github.com/xxbeanxx/castle-clash/commit/dac5420d90c89190d5942c185f86f12f95b6a9c3))
* **ci:** give the e2e job a real local Supabase ([cb3cac8](https://github.com/xxbeanxx/castle-clash/commit/cb3cac89deefac2dc816d900d5e8aa4ab4d78539))
* **client:** make PixiJS work under the nginx CSP ([272b22a](https://github.com/xxbeanxx/castle-clash/commit/272b22a671579650cf6cab26cfa99f6902de049e))
* e2e specs + PixiJS under the CSP (game canvas never started) ([7d75297](https://github.com/xxbeanxx/castle-clash/commit/7d7529780c31c6b4841a9d4a0f60a2547ecfde3d))
* **e2e:** sign in before the lobby and scope the tint swatches ([586089e](https://github.com/xxbeanxx/castle-clash/commit/586089e78566d9b7062981cf1710cd967604332c))
