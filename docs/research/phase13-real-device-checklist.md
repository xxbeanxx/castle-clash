# Phase 13: real-device checklist (manual, no CI substitute)

Phase 13's gate is "a person completes a full match on a phone against a desktop player, and it is
playable rather than merely functional". Everything CI can prove is proved (emulated viewports,
DPR, multi-touch through CDP, reconnect through the SDK); none of it is a phone. Run this on each
device below against **staging**, then fill in the results table and commit the note. Until a row is
filled in, that device is **unverified**.

Devices: **iOS Safari** (tab), **iOS home-screen web app** (Add to Home Screen, then launch from the
icon), **Android Chrome** (tab, and installed). Ideally one small phone (iPhone SE / 667x375 class)
and one notched, tall one.

Setup: open staging on the phone, Play as guest, create a private room, join it from a desktop
browser with the code.

## Checks

1. **Rotate prompt.** Portrait shows "Rotate your device to play"; turning to landscape clears it.
   On iOS the manifest cannot lock orientation, so a locked-portrait phone should still see the prompt.
2. **Scale and sharpness.** The arena fills the screen with crisp, evenly sized pixels (no shimmer
   while the camera shakes), no black bars, background reaching the edges. Note the device's
   CSS size and DPR (`window.innerWidth/innerHeight/devicePixelRatio` in Safari's Web Inspector).
3. **Safe areas.** On a notched phone, HUD text, the stick hint and the button cluster are not under
   the notch or home indicator. (`viewport-fit=cover` is deliberately not set; if content is
   letterboxed at the sides that is expected, if controls are clipped that is a bug.)
4. **Stick.** Anywhere in the left half starts it; walking both ways, reversing quickly, and a
   flick down (drop through a platform while pressing Jump) all work. Nothing sticks after lifting.
5. **Buttons.** Jump, Light, Heavy, Block (hold), Dodge each register; a very quick tap still
   registers; sliding a thumb from Light to Heavy switches; the right thumb can reach all five
   without moving the hand.
6. **Multi-touch.** Stick + Jump + attack together; a third finger anywhere does nothing odd.
7. **No gesture leaks.** No page scroll, pull-to-refresh, pinch zoom, double-tap zoom, text
   selection, long-press callout or context menu, from the canvas or the controls.
8. **Settings.** Size, opacity and left-handed change the layout and persist across a reload; the
   gear and fullscreen buttons are reachable and do not overlap the HUD.
9. **Fullscreen.** iPhone Safari: no button (expected). iPad: button works and can be exited.
   Android Chrome: enters fullscreen and, if it can, locks landscape.
10. **Home-screen app.** Launches with no browser chrome (iOS: `standalone`), icon is the tower, and
    play works the same. Android: an install prompt or "Install app" appears.
11. **Backgrounding.** Switch away mid-match for 5 s, then 30 s, then back. Expect "Reconnecting…"
    then play resuming, or "Connection lost" with a way back; never a frozen or fast-forwarding
    game, and no stuck direction on return.
12. **Overlays.** Draft cards are comfortably tappable; results screen scrolls if it is tall and its
    buttons are reachable; the lobby and loadout pages are usable at this height.
13. **Performance.** Smooth at 60 fps through a busy fight (Safari Web Inspector / Chrome
    `chrome://inspect` frame timeline, or the `frameStats()` numbers in an E2E build). Note any
    device that drops frames: the lever is `MAX_DPR` in `game/render/surface.ts`.
14. **The gate.** Play a whole match against the desktop player. Was it playable, not just
    functional? What was the first thing that annoyed you?

## Results (fill in; one row per device and mode)

| Date | Device / OS / browser | Mode | Checks failed (numbers) | Frame rate | Gate: playable? | Notes |
| ---- | --------------------- | ---- | ----------------------- | ---------- | --------------- | ----- |
|      |                       |      |                         |            |                 |       |
