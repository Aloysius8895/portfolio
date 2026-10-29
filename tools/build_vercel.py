"""Build only deployable files; never bundle source media, credentials or drafts."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def build(output=None, data_path=None):
    output = Path(output or ROOT / 'dist').resolve()
    if output == ROOT or not output.is_relative_to(ROOT):
        raise ValueError('Build output must be a child of the workspace')
    if output.relative_to(ROOT).parts[0] in {'template3', 'admin', 'lib', 'api', 'tests', 'tools', 'diskPic', 'node_modules'}:
        raise ValueError('Build output cannot overwrite project source directories')
    # Build into a separate output. Never rewrite the editable source website.
    output.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'template3/site', output, dirs_exist_ok=True)
    shutil.copytree(ROOT / 'template3/hero', output / 'hero', dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('tools', 'backup', '__pycache__', '*.pyc'))
    shutil.copytree(ROOT / 'admin', output / 'admin', dirs_exist_ok=True)
    data_path = Path(data_path or ROOT / 'template3/projects/projects.json').resolve()
    data = json.loads(data_path.read_text(encoding='utf-8'))
    published = {p['slug'] for p in data['projects'] if p.get('status', 'published') == 'published'}
    if not published:
        raise ValueError('Keep at least one published project for the disk gallery')
    drafts_path = ROOT / 'template3/projects/drafts.json'
    drafts = json.loads(drafts_path.read_text(encoding='utf-8')) if drafts_path.exists() else {}
    known = set(drafts) | {p['slug'] for p in data['projects']}
    for slug in known - published:
        destination = (output / 'production' / slug).resolve()
        if not destination.is_relative_to(output / 'production') or not slug or '/' in slug or '\\' in slug:
            raise ValueError('Invalid project route')
        if destination.exists():
            shutil.rmtree(destination)
    env = {**os.environ, 'PORTFOLIO_SITE': str(output), 'PORTFOLIO_DATA': str(data_path)}
    subprocess.run([sys.executable, str(ROOT / 'template3/projects/build.py')], check=True, env=env)
    # Resolve the mirror's query aliases at build time; Vercel ignores queries
    # when looking up static paths, unlike the local asset-map server.
    mapping = json.loads((ROOT / 'template3/asset-map.json').read_text(encoding='utf-8'))
    for url, source in mapping.items():
        path = url.split('?')[0]
        if path == '/' or not Path(path).suffix:
            continue
        destination = (output / path.lstrip('/')).resolve()
        original = (ROOT / 'template3/site' / source).resolve()
        if not destination.is_relative_to(output) or not original.is_relative_to(ROOT / 'template3/site'):
            raise ValueError('Invalid asset mapping')
        if not destination.exists() and original.is_file():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, destination)
    print(f'Vercel output: {output} ({len(published)} published projects)')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output')
    args = parser.parse_args()
    build(args.output)
