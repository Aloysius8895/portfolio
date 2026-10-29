# Project studio: local use and Vercel setup

## Current production deployment

Public website: https://portfolio-indol-one-ram3c051o2.vercel.app

Project: `chill-chill/portfolio`. Source: `Aloysius8895/portfolio` (public, explicitly selected by the owner). Initial production build and public browser verification succeeded on 2026-10-29. Nine projects, the three award labels, portrait frames and gallery transition were checked. `/admin` currently shows the setup gate; production owner login and publishing are not enabled until credentials are configured.

Vercel could not connect the Git repository automatically because its account needs a GitHub Login Connection. The current deployment was made manually with the CLI. Add the appropriate GitHub login connection in Vercel, then connect `Aloysius8895/portfolio` to this project to enable push-triggered updates. A successful manual deployment does not imply that Git-triggered publishing is active.

Production configuration already supplied: `PUBLIC_BASE_URL`, `ADMIN_GITHUB_ID`, `PORTFOLIO_REPOSITORY`, `PORTFOLIO_BRANCH` and a generated secret stored as a Vercel sensitive environment variable. Remaining owner setup: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN`, plus the Vercel GitHub Login Connection. No credential values belong in this document or chat.

Dependency note: the deployment audit flags the available Sharp 0.34.5 dependency. The configured registry did not provide the recommended 0.35.5 release at deployment time. The image processor therefore applies the maintainer-documented decoder allowlist: only PNG/JPEG/WebP Buffer loaders are enabled, and byte signatures are checked before metadata inspection. All other foreign loaders are blocked, including SVG, HEIF/AVIF, GIF, TIFF and VIPS. Regression tests cover decoding and disallowed loaders. Upgrade the dependency once the patched release is available in the configured registry; do not remove this allowlist. See [Sharp's decoder controls](https://sharp.pixelplumbing.com/api-utility/#block) and [upstream advisories](https://github.com/lovell/sharp/security/advisories).

## Use it locally

Requires Node.js 24 and Python 3.10 or newer. Start `Start-Preview.cmd` from the portfolio folder. It installs locked dependencies on its first run, then serves:

- Portfolio: http://127.0.0.1:8083
- Project studio: http://127.0.0.1:8083/admin

Stop the previous Python preview window before restarting with the updated launcher. Alternatively run `npm ci`, then `npm start`. For a separate preview port: `node --use-system-ca admin-server.mjs --port 8084`.

Without online configuration, the loopback server opens in **Local draft studio** mode. You can import public GitHub repositories, upload/adjust artwork, preview and save drafts. Drafts persist in `.local-admin/` and do not modify the public nine-project portfolio. Local Publish and Unpublish are disabled. Draft files and credentials are ignored by Git. This mode is never enabled by the deployed Vercel function.

## Initial deployment

1. Put this portfolio into its own GitHub repository. Keep the root `package.json`, `package-lock.json`, `vercel.json`, `admin/`, `api/`, `lib/`, `tools/` and `template3/`. Keep `diskPic/` and `final.mp4` if you want the source artwork and portrait source backed up there. Do not upload `node_modules`, `dist`, `.local-admin`, `.admin-verification`, `.vercel` or `.env`.
2. Import that repository into Vercel. Use the **repository root** as Root Directory, Other as the framework preset and Node.js 24. `vercel.json` supplies `npm ci`, `npm run build` and `dist`. The build uses Python's standard library and does not rebuild the portrait source or require OpenCV/Playwright.
3. Deploy once to establish the production URL. The public portfolio works before authentication is configured; `/admin` shows setup information and exposes no editing access.
4. Create a GitHub **OAuth App** under your account's Settings → Developer settings → OAuth Apps. Homepage URL: the production origin. Callback URL: `https://YOUR-DOMAIN/api/admin/callback`. Use the production domain consistently; preview deployments do not become an alternate login origin automatically.
5. Create a **fine-grained personal access token** restricted to the portfolio repository only. Set repository permissions **Contents: Read and write** and **Commit statuses: Read-only**. Do not give it access to every project repository. Public project metadata imports need no write access to those repositories. Set a suitable expiry and renew it before it expires.
6. Get your numeric account ID from `https://api.github.com/users/YOUR-LOGIN` (the `id` field). The configured account must be the owner intended to publish this portfolio. The commit author is its GitHub-linked noreply identity, which also matters for Vercel Hobby's owner restrictions.
7. Add the following server-side environment variables in Vercel's project settings, using `.env.example` as the template. Redeploy after setting them. Never paste secret values into the admin interface or commit them to Git.

| Variable | Value |
| --- | --- |
| `PUBLIC_BASE_URL` | Production origin, e.g. `https://your-site.vercel.app` |
| `ADMIN_GITHUB_ID` | Numeric GitHub user ID allowed to administer the portfolio |
| `GITHUB_CLIENT_ID` | OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App secret |
| `GITHUB_TOKEN` | Restricted token for the portfolio repository |
| `PORTFOLIO_REPOSITORY` | `owner/portfolio-repository` |
| `PORTFOLIO_BRANCH` | Production branch, normally `main` |
| `SESSION_SECRET` | Random secret with at least 32 characters |

Generate the signing secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The application uses GitHub OAuth only to identify the signed-in account. It does not send the portfolio token to the browser. Branch protection must permit that configured owner's publishing method; if direct updates are blocked, publishing fails safely and the studio reports the conflict. It never force-pushes.

## Add a project

1. Open `/admin` and sign in with the allowed GitHub account.
2. Choose Add project and import a public repository URL.
3. Review the imported name, description, languages and genuine creation date. Supply English text where the repository description is missing or not suitable. Team/role fields remain yours to fill; they are not guessed. The README is shown as plain reference text, never executed.
4. Upload a non-animated PNG, JPEG or WebP, at most 3 MB and between 128 and 4096 pixels per side. The original is kept. A photographed disk is fitted to an annular texture; a flat image can use the circular-crop mode. If detection fails, use the manual outline and hole controls. Preview after changing scale, rotation or position.
5. Save draft to persist work without replacing the published version. Drafts in a public source repository are readable by people who can read that repository, even though drafts are not included in public project pages.
6. Preview, then publish. Data and source/prepared artwork are committed together to the fixed portfolio branch. Vercel builds the public site from that revision. Use Check deployment to distinguish saved/pending/live/failed. A failed deployment leaves the last successful public deployment available.

Changing an existing project and saving a draft keeps its current public content intact. Edit a saved image with Adjust saved image. The legacy nine prepared disks can be replaced by uploading their retained original from `diskPic/`. Unpublish moves an entry back to draft; keep at least one public project for the disk gallery. Changing a saved URL slug or permanently deleting source artwork is intentionally not offered.

Concurrent changes return a conflict. Review latest changes merges untouched fields from the newer project and retains your edits; if both versions changed the same field, explicitly choose which version to keep. No silent force overwrite occurs.

## Storage and builds

- Published entries: `template3/projects/projects.json`.
- Draft entries: `template3/projects/drafts.json` (created on first online save).
- Uploaded sources: `template3/projects/uploads/<sha256>.<extension>`.
- Prepared textures: `template3/site/project-discs/<slug>-<hash>.webp`.
- Existing root artwork and prepared textures remain unchanged.
- `tools/build_vercel.py` produces `dist/`, copies hero/admin assets and resolves old asset-map aliases. It removes draft-only project routes from the output and escapes generated text/structured data.
- Draft edits can trigger a Vercel rebuild because GitHub is the content store; public project content changes only when published or unpublished.

## Verification

```powershell
npm test
npm run check
python -m unittest discover -s tests -p 'test_*.py'
npm run build
```

Tests use controlled GitHub mocks for publishing and OAuth: they do not make test commits in a live repository. Browser verification uses an isolated local draft store, checks desktop/mobile and the real public GitHub metadata import, and leaves the canonical project data unchanged. Production login, repository writes and Vercel deployment must be checked after the owner configures the actual repository and credentials.

References: [Vercel Git deployments](https://vercel.com/docs/git), [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json), [GitHub OAuth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [GitHub Git data API](https://docs.github.com/en/rest/git).
