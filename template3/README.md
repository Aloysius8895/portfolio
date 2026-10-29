# Chill Portfolio ? Active Website

This is the public website launched by `../Start-Preview.cmd` at http://127.0.0.1:8083. The updated launcher also serves the project studio at `/admin`; see [admin setup](docs/admin-deployment.md).

## Run

```powershell
cd ..
npm start
```

Requires Node.js 24 and Python 3.10+. Run `npm ci` before the first start, or let `Start-Preview.cmd` install dependencies. Keep the terminal open. The old `python serve.py --port 8084` remains a public-site-only preview and does not run the administration API.

Use HTTP rather than opening `site/index.html` directly. `serve.py` maps `/hero/` to the portrait source directory and resolves local routes with `asset-map.json`.

## Maintain

- Personal information: `hero/config.js`.
- Project content and order: `projects/projects.json`. Run `python projects/build.py` after changes. Projects sort by creation date, newest first.
- Disc artwork originals: `../diskPic/`. Run `python projects/build_disc_art.py` to rebuild cover textures.
- Portrait source: `../final.mp4`. Run `python hero/tools/prepare_final.py`, then `python hero/tools/prepare_frame_atlas.py` to rebuild prepared assets.
- Runtime pages and assets: `site/`. Retain the compiled modules, models, fonts and textures used by the gallery.

Artwork preparation needs OpenCV, NumPy, Pillow, imageio-ffmpeg and, for disc exports, Playwright. These packages are not required just to start the site.

## Portrait behavior

All 240 source frames are prepared into desktop/mobile WebP atlases. The pointer continuously selects a fractional frame and the renderer blends its neighboring frames. Five expression intervals cover approximately equal pointer areas, recalibrated after resizing. Buttons select sample poses; touch devices can use the buttons.

`followSmoothingMs: 180` and `followMaxFramesPerSecond: 72` retain the slower response. Reduced motion shows the target directly. The renderer stops drawing when settled and pauses when the introduction is hidden.

Light background removal preserves enclosed eyes, glasses and hair and composites the portrait onto the page background. Original video and disc images are retained unchanged. The generated `hero/assets/final/` manifest and stills support rebuilding and fallback; the live portrait uses `hero/assets/final-atlas/`.

## Checks

From the parent directory: `npm test` and `npm run check`.

`verification/check-white-balanced.py` checks pointer distribution and sample buttons with Playwright. Start a test server on port 18085 before running it from this directory. It writes current screenshots and a report in `verification/`.

Historical crawler reference files, old screenshots, unused portrait modules and the previous root website have been removed. Current site assets and project build tools remain. See `docs/cleanup-2026-10-29.json` for cleanup paths.
