# Project administration implementation plan

**Goal:** Deliver the approved GitHub-backed `/admin` workflow, local draft preview and Vercel-ready deployment without changing the existing portfolio presentation.

**Execution:** Inline in this session. The workspace has no Git metadata, so record verified file changes without creating unsolicited remote commits or a repository.

**Architecture:** A shared Node request handler runs as a Vercel function and behind a loopback development server. GitHub stores project JSON, drafts and immutable source/texture images in atomic commits. Native Sharp decoding and a small image-geometry module normalize photographed disks before save, avoiding OpenCV/Chromium in serverless functions. Python builds the existing public pages and copies a complete deployment output.

**Stack:** Node 24, built-in HTTP/crypto/fetch, Sharp, plain HTML/CSS/ES modules, existing Python page generator.

## Constraints

English UI and public copy. Existing nine entries and portrait behavior survive. Only the configured numeric GitHub user ID can publish. No browser secrets, no disk persistence on Vercel, no force overwrite, no production local-auth bypass. Local publishing is disabled without production configuration. No live test commits. Source images remain retained. Publish status distinguishes saved, pending, live and failed.

## Task 1: Domain, artwork and storage

Files: `lib/admin/domain.mjs`, `artwork.mjs`, `github.mjs`, `stores.mjs`; `tests/admin-domain.test.mjs`, `admin-artwork.test.mjs`, `admin-store.test.mjs`.

Interfaces: `parseRepository(url) -> {owner,repo}`; `validateProject(input, metadata, previous) -> project`; `prepareArtwork({data,mime,calibration}) -> {source,texture,extension,geometry,digest}`; `store.read() -> {data,drafts,revision}`; `store.save({revision,data,drafts,files,user,message}) -> {revision,mode}`.

- [x] Test rejection of invalid URLs, unsafe markup/URLs/slugs, unsupported raster bytes and excessive image dimensions. Test equal creation-date ordering and preservation of existing records.
- [x] Implement bounded fields, typed error responses and explicit repository owner identity. Retain real metadata and do not manufacture team or contribution details.
- [x] Fit source disk outline and hub, project pixels into a normalized annular WebP, expose flat/manual fallback and preview calibration. Test representative source images, transparent hole and unsupported bytes.
- [x] Implement GitHub HTTP client with timeouts, pinned-revision content reads and single-tree commit + non-forced branch update. Use a fetch-injected mock to test conflicts and rollback behavior.
- [x] Implement loopback draft storage in ignored `.local-admin/`, separate from public project JSON, with atomic state replacement and no remote publishing.

```js
const snapshot = await store.read();
await store.save({ ...snapshot, revision: snapshot.revision, files: [], user, message: 'Save project draft' });
```

## Task 2: Authentication and API

Files: `lib/admin/auth.mjs`, `handler.mjs`, `api/admin.js`, `admin-server.mjs`; `tests/admin-api.test.mjs`.

Interface: `createHandler({env,fetch,local,root}) -> async(req,res)` with routes `session`, `login`, `callback`, `logout`, `projects`, `import`, `artwork`, `save`, `unpublish`, `image`, `deployment` under `/api/admin/`.

- [x] Test owner-only OAuth state/session validation, expiry, CSRF/origin checks and missing configuration. Never infer write destinations from client input.
- [x] Implement GitHub OAuth login, signed HttpOnly sessions and same-origin mutation checks. Local draft mode is selected by the loopback server only, not a production environment flag.
- [x] Connect import, draft, publish, edit and unpublish operations. Detect duplicate repositories/slugs, preserve the published version during draft edits, sanitize all input and use immutable artwork paths.
- [x] Return distinct saved/pending/live/failed statuses based on GitHub Vercel checks; do not label a mere commit live.
- [x] Serve the existing asset map and `/hero/` locally while reserving `/admin` and `/api/admin/`. Keep startup at port 8083.

```js
const handler = createHandler({ env: process.env, fetch: globalThis.fetch, local: false, root });
export default handler;
```

## Task 3: Administrative UI

Files: `admin/index.html`, `admin/admin.css`, `admin/admin.js`.

- [x] Build owner login/setup and project-list screens, newest first, with Published / Draft / Unpublished changes badges.
- [x] Add repository import, complete editable English content, uploaded raster preview and annular disk preview with fit/rotation/zoom controls.
- [x] Add draft persistence, preview dialog, explicit publish, unpublish and deployment-state feedback. Use textContent for imported material and display recovery errors without losing edits.
- [x] Check desktop/mobile layout, keyboard focus, accessible validation, cancel/dirty navigation and image-request races.

## Task 4: Public build, deployment and integration checks

Files: `tools/build_vercel.py`, `vercel.json`, `.env.example`, `.gitignore`, `template3/projects/build.py`, root startup/package/readme files; `tests/test_public_build.py` and browser verification artifacts.

- [x] Filter published projects, respect per-project repository owners, escape JSON-LD closing tags and HTML values, and remove unpublished project routes from deployment output.
- [x] Build into `dist/`, including static site, hero and admin. Preserve original image textures; no source media rebuild is needed for ordinary deployment.
- [x] Supply OAuth callback and GitHub/Vercel configuration instructions, keeping secrets outside the browser and Git.
- [x] Run Node unit/integration tests and a Python isolated-output build check. Exercise mocked end-to-end publishing without contacting a live write endpoint.
- [x] Launch a local test server, verify existing nine project pages and portrait/gallery, complete import/upload/draft/preview on desktop and mobile, and inspect screenshots.

```powershell
npm test
npm run check
python -m unittest discover -s tests -p 'test_*.py'
npm run build
```

Production connection remains a user setup step after local verification: portfolio repository, owner GitHub OAuth application, restricted server-side GitHub credentials and the Vercel project.


## Verified outcome

18 Node tests and 2 isolated Python build tests pass. OAuth/owner checks, CSRF, mocked atomic publishing and unpublishing, stale-save handling, draft/public separation and source image validation are covered. Browser checks passed for actual public GitHub import, photographed disk upload/normalization, project preview, persistence after reload, saved-source image adjustments and a concurrent edit merge. Desktop/mobile screenshots were inspected. The built public output still has all nine projects, working portrait sampling and the gallery transition, with no script or HTTP errors. Vercel configuration instance validates against the published schema.

Reports: `verification/admin-results.json` and `verification/admin-build-results.json`. Deployment setup: `docs/admin-deployment.md`. Production OAuth, live GitHub writes and Vercel deployment have not been attempted; the owner has supplied an account homepage, not a portfolio repository. That external configuration remains required, as planned.
