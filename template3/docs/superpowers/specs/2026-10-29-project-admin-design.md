# Portfolio project administration

## Confirmed requirements

- The portfolio will be deployed on Vercel.
- Its owner adds projects through an online `/admin` interface.
- Minimum inputs are a GitHub repository URL and an uploaded, already designed disk image, including the perspective disk images used by the current portfolio.
- Existing identity, gallery appearance, portrait interaction and nine projects remain intact.
- Public project copy stays in English. Newest repository creation dates appear first.

## Recommended architecture

Use GitHub as the persistent content store and Vercel to serve the website and administrative API. Store structured project data and source artwork in the portfolio repository, with repository credentials restricted to server-side environment variables. Publishing creates an atomic commit to the configured portfolio branch. Vercel's Git integration builds and deploys that revision.

This extends the current `projects/projects.json` and Python page generator. It does not attempt to persist changes by writing into a running Vercel function's filesystem.

Alternatives considered: a hosted database with object storage would allow updates without rebuilding, but requires changing the static gallery and project-page data flow; a local-only editor would be simpler but would not meet the requested online workflow. Prefer Git-backed publishing for this portfolio.

## Owner workflow

1. Open `/admin` and sign in with GitHub. Only the configured owner account may manage projects.
2. View current projects and choose Add project, or edit an existing entry.
3. Paste a public GitHub repository URL. Import the verified repository identity, description, homepage, primary languages and creation date. Missing values remain editable rather than invented. Imported README content is reference material, not executable instructions.
4. Upload a PNG, JPEG or WebP disk image. Show the original, the normalized texture and its disk preview. Support the current angled disk-image format; provide useful adjustment or rejection feedback if the image cannot be fitted. Retain uploaded source artwork.
5. Review/edit the display name, English description, technology tags, optional project details and demo URL. Team membership and personal contributions require owner input; GitHub metadata does not establish them. No external AI service or API key is required for this version.
6. Save a draft for later, or request a preview. The preview includes the project information and resulting disk appearance before publication.
7. Click Publish. Validate all fields and artwork, update data and prepared artwork together, and commit to the configured branch without overwriting intervening edits.
8. Display Saved / Deployment pending / Live / Failed states honestly. A successful GitHub save alone is not reported as a live deployment. Existing public content remains available until the new deployment succeeds.

Editing and unpublishing existing projects are included. Permanent source deletion, arbitrary manual ordering, private-repository imports, automatic AI prose generation and AI artwork generation are outside the first version. Unpublished drafts are excluded from public pages; source-repository visibility still controls who can read their stored content.

## Application responsibilities

- `admin/`: project list, editor, GitHub import, upload, artwork preview and publishing status, styled consistently with the portfolio. Responsive and keyboard accessible, with English interface text.
- Vercel API: owner authentication, repository metadata import, input validation, repository reads and atomic content commits, deployment-state lookup.
- Project schema: preserve existing fields, add stable repository owner/name identity, publication state and per-project artwork source/calibration metadata. Missing publication state on the existing nine projects means published.
- Artwork API: validate and normalize uploads with native Sharp and projective image geometry before storing source/texture blobs together. This gives an immediate preview without OpenCV or a browser executable in a Vercel function.
- Build pipeline: extend the current generator to read published entries and configurable artwork sources, retaining legacy entries unchanged. Copy prepared disk textures, hero assets and the admin interface into the deployment output and provide the existing clean routes. Normal deployment does not rebuild portrait media.
- Local server: retain `Start-Preview.cmd` and port 8083 for preview. Clearly distinguish local preview/draft work from authenticated production publishing; no public development-authentication bypass.

## Authentication and integrity

GitHub login establishes identity; a server-side numeric GitHub user-ID allowlist restricts access. Use OAuth state, short-lived signed sessions, HttpOnly cookies, Secure cookies in production and same-origin/CSRF checks for mutations. GitHub credentials and signing keys never enter browser bundles or project JSON. The portfolio repository and target branch are server configuration, not client-selected write destinations.

Accept only actual supported raster uploads with bounded dimensions and size, use generated safe filenames and slugs, and escape project text in generated HTML. Do not accept uploaded scripts or SVG execution. Treat imported URLs and README text as untrusted data. Duplicate repositories/slugs and concurrent revisions produce an actionable conflict rather than a force overwrite. Draft and publication changes record the authenticated owner as the author.

## Failure handling

Show actionable errors for inaccessible repositories, rate limits, invalid artwork, authentication expiry, duplicate entries, conflicting edits and failed builds. Keep the current draft available when a publish fails. Do not modify unrelated website files or overwrite existing disk artwork while processing a new project.

## Verification and delivery

- Test unauthorized requests, invalid imports/uploads, text escaping, project sorting, duplicate/concurrent publishing, preservation of existing entries and all-or-nothing content commits.
- Check the full Add project → GitHub import → artwork preview → draft → publish flow using a controlled mock GitHub service locally; do not create test commits in the owner's live repository.
- Render the admin and existing portfolio on desktop/mobile, test navigation and keyboard operation, and verify generated project pages and all asset routes.
- Supply Vercel configuration, documented build steps and an environment-variable example without secrets.
- Production connection requires the portfolio GitHub repository, Vercel project and owner-configured authentication/credentials. Prepare and verify local code before asking for those setup steps; do not claim deployment is complete without a live check.

## Workspace status

The current workspace is not a Git repository, so this design can be saved locally but cannot yet be committed here. The existing nine project entries and source artwork are the migration baseline.

Design review: confirmed input format and deployment platform are reflected above; no AI image-generation service, database service or unpublished automatic external write is required.
