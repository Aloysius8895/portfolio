# Chill Portfolio

Aloysius Ting Zi Heng's active portfolio lives in `template3/`.

## Start

Requires Node.js 24 and Python 3.10 or newer. From PowerShell:

```powershell
cd C:\maven\portfolio
.\Start-Preview.cmd
```

Open http://127.0.0.1:8083 and keep the terminal open. Open **http://127.0.0.1:8083/admin** for the project studio. Refresh with Ctrl + F5 after changes.

The launcher installs locked dependencies on its first run. You can also run `npm ci`, then `npm start` from this folder. Stop an old Python preview window before starting the updated server.

## Project studio and deployment

The studio imports public GitHub project metadata, previews uploaded disk artwork, saves drafts and edits existing entries. Without online setup it runs as a local draft editor and leaves published project data unchanged. GitHub-authenticated publishing and unpublishing are enabled after production configuration.

Deploy the **repository root** to Vercel. See [the setup guide](template3/docs/admin-deployment.md) and `.env.example` for GitHub login, owner restrictions and repository configuration. Secrets belong in Vercel environment variables, not in Git or the editor. `npm run build` creates the deployable `dist/` output.

## Files

- `Start-Preview.cmd`: launches the active site.
- `template3/site/`: pages, project discs, fonts and application assets.
- `template3/hero/`: portrait, continuous expression mapping, animation and prepared media.
- `template3/projects/`: project data and build tools.
- `final.mp4`: current white-background source video; retained for rebuilding portrait assets.
- `diskPic/`: original project disc artwork; retained for rebuilding covers.
- `tests/`: tests for the active continuous expression mapping.
- `admin/`, `api/`, `lib/admin/`: administrative interface, authenticated API and content/artwork processing.
- `tools/build_vercel.py`, `vercel.json`: public website build and deployment configuration.

See [maintenance instructions](template3/README.md). Run `npm test`, `npm run check` and `python -m unittest discover -s tests -p 'test_*.py'` for the application checks.

The previous root website and obsolete expression implementations were removed on 2026-10-29. Cleanup records are in `template3/docs/cleanup-2026-10-29.json`.
