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

All 240 source frames are prepared into desktop/mobile WebP atlases. Moving the pointer around the face advances a circular phase: one complete orbit is one expression cycle, with five equal parts of a turn (72 degrees each). The next orbit continues through the last/first boundary without rewinding; opposite motion reverses through the same boundary. Radial movement adds a small continuous phase adjustment. The renderer blends neighboring frames within the video and restarts directly from frame 239 to frame 0 at the seam. The original first/last poses differ, so they are not crossfaded into a held double image. Buttons select the nearest cyclic sample pose; touch devices can use the buttons.

`followSmoothingMs: 180` and `followMaxFramesPerSecond: 72` retain the slower response. Reduced motion shows the target directly. The renderer stops drawing when settled and pauses when the introduction is hidden.

Light background removal preserves enclosed eyes, glasses and hair and composites the portrait onto the page background. Original video and disc images are retained unchanged. The generated `hero/assets/final/` manifest and stills support rebuilding and fallback; the live portrait uses `hero/assets/final-atlas/`.

## Mobile gallery recovery

Mobile galleries cap artwork textures at 512 pixels and skip spare-renderer warmup. The portrait releases its atlas textures when the gallery takes over, and reloads them on return. Healthy galleries retain the original 3D rendering. Lost or unavailable WebGL contexts switch to a raster/CSS disk with the same artwork, metadata, detail links, swipe controls and Index navigation. Lost renderers are disposed rather than pooled. On touch devices, the canvas skips its separate opacity reveal to avoid an idle composited surface becoming invisible.

`python tools/verify_mobile_discs.py` checks WebKit and Chromium mobile rendering, forced context loss, unavailable WebGL, navigation, portrait reload and landscape layout. Use `--base https://your-site.vercel.app` to verify deployment. These are browser-engine tests, not physical iPhone testing.

## Checks

From the parent directory: `npm test` and `npm run check`.

From the repository root, `python tools/verify_cyclic_follow.py` checks repeated pointer orbits, reverse seams, stopped-pointer hold, resizing and mobile sample buttons with Playwright. It uses the running local server on port 8083 by default; pass `--base https://your-site.vercel.app` to check a deployment. It writes screenshots and a report in `template3/verification/`.

Historical crawler reference files, old screenshots, unused portrait modules and the previous root website have been removed. Current site assets and project build tools remain. See `docs/cleanup-2026-10-29.json` for cleanup paths.
