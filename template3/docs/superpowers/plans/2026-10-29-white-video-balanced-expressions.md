# White video and balanced expressions

Goal: replace the portrait with the new final.mp4, and make all five expressions similarly accessible while retaining continuous following and the slower transition.

- [x] Extract the light perimeter background, retaining enclosed dark features and floating expression details; regenerate both atlas sizes and poster from the new source.
- [x] Calibrate a continuous distribution from evenly sampled positions across the visible hero. Map its five equal quantile ranges to the five source expression ranges, without discrete triggers or playback queues. Recalibrate after resize.
- [x] Check distribution on independent viewport grids, continuity, reversal, source integrity, desktop/mobile rendering and fallback samples. Record results.

Keep 180ms smoothing and the 72 source-frame/second speed limit. Original source is read-only. Example buttons remain exact source-time requests; reduced motion remains immediate.

Verification: 51 Node tests passed, including independent-grid balance and continuous rank interpolation. Browser results in `verification/white-balanced-results.json`: desktop, resized desktop and mobile each cover 19.93–20.04% per expression. Actual pointer targets match the calibrated field before and after resize; all sample buttons pass. WebGL and Canvas2D paths render correctly with no page errors. Desktop/mobile screenshots inspected. New source hash matches generated manifest: `02897a1bcf68fbd445e595f35e060662c08f9192fba5e19ccef70f87bece1343`.
