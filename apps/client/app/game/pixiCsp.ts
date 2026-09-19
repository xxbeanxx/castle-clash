/**
 * Makes PixiJS work under the client's nginx CSP (`docker/entrypoint.sh`),
 * which deliberately has no `'unsafe-eval'` in `script-src`.
 *
 * Out of the box Pixi v8 generates its shader-sync code with `new Function`,
 * which that CSP forbids: `Application.init` throws "Current environment does
 * not allow unsafe-eval, please use pixi.js/unsafe-eval", and the game canvas
 * never starts. Importing Pixi's own `unsafe-eval` entry point swaps in
 * precompiled equivalents, so the CSP stays strict.
 *
 * A side-effect import that patches Pixi globally: import it (once is enough,
 * but every module that creates an `Application` does, so none depends on
 * another having loaded first) before `Application.init` runs.
 */
import "pixi.js/unsafe-eval";
