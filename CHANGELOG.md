# Changelog

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
