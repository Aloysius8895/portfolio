# Cyclic expression follow

Approved behavior: one pointer orbit advances one full expression cycle; continuing across the last/first boundary starts the next cycle instead of rewinding the movie. Opposite pointer motion reverses naturally, including reverse seam crossing. Keep 180ms smoothing, 72 source frames/second, stopped-pointer hold, reduced motion and the current material/layout.

Implementation: replace the nonperiodic area-rank field with a polar phase around the calibrated face center. Each of five source expression intervals occupies one fifth of a turn; small radial input still changes the phase. A tiny center singularity guard holds the previous target. Unwrap phase across successive pointer events and discard obsolete whole-lap backlog. Renderer samples source frames modulo 240, blends neighboring frames within the source and restarts directly at the last/first seam.

- [x] `expression-field.js`: phase/frame inverse mapping, wrapped blend samples and a pure pointer cycle tracker; tests for repeated clockwise turns, counterclockwise reversal, equal intervals, seam steps, center hold and no queued old laps.
- [x] `frame-follower.js`, `atlas-renderer.js`, `hero.js`: integrate absolute cycle targets, wrapped visible state, nearest cyclic sample-button requests and lifecycle resets; remove obsolete viewport-rank calibration.
- [ ] Verify actual pointer circles, sample buttons, idle/reduced motion, resize/mobile rendering and gallery pause. Update docs, run application checks, commit/push and redeploy the existing Vercel project; check production behavior.

No new image/video generation, video seeking or autoplay is introduced. Frame zero directly follows frame 239. Visual QA showed that crossfading the different first/last source poses creates a held double face, so only that crossfade is disabled. No synthetic facial motion is invented.

Local verification: 21 Node tests and 2 isolated public-build tests passed. The Playwright orbit verifier passed two forward laps with exactly two seam crossings, one reverse lap, an actual 239.75-frame seam sample without script errors, a nearest-cycle sample-button move of 26.4 frames, stopped-pointer hold, resized pointer orbit, mobile Canvas2D samples and gallery pause. Desktop/mobile screenshots inspected; the seam no longer has a held double image. Source video and atlas files remain unchanged.
