"""Serve the local A24 reproduction, including clean routes and media ranges."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import json
import re

ROOT = Path(__file__).resolve().parent
SITE = (ROOT / 'site').resolve()
HERO = (ROOT / 'hero').resolve()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary'}

    def __init__(self, *args, mapping=None, **kwargs):
        self.mapping = mapping or {}
        self.byte_range = None
        super().__init__(*args, directory=str(SITE), **kwargs)

    def translate_path(self, url):
        request = urlsplit(url)
        if request.path.startswith('/hero/'):
            # The intro hero lives beside the mirror, not inside it.
            destination = (HERO / unquote(request.path)[len('/hero/'):]).resolve()
            if not destination.is_relative_to(HERO) or destination.parent.name == 'backup':
                return str(SITE / '__invalid__')
            return str(destination)
        key = request.path + ('?' + request.query if request.query else '')
        mapped = self.mapping.get(key)
        if mapped is None:
            # Tracking or a harmless cache-buster must not break a clean page route.
            mapped = self.mapping.get(request.path)
        destination = (SITE / (mapped or unquote(request.path).lstrip('/'))).resolve()
        if not destination.is_relative_to(SITE):
            return str(SITE / '__invalid__')
        if destination.is_dir():
            destination = destination / 'index.html'
        return str(destination)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        target = Path(self.translate_path(self.path))
        if not target.is_file():
            self.send_error(404, 'Local resource not found')
            return None
        size = target.stat().st_size
        start, end = 0, size - 1
        range_header = self.headers.get('Range')
        if range_header:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header.strip())
            if not match or not any(match.groups()):
                self.send_error(416, 'Unsupported byte range')
                return None
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            else:
                start = max(0, size - int(last))
            if start >= size or end < start:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.end_headers()
                return None
        source = target.open('rb')
        source.seek(start)
        self.byte_range = (start, end)
        self.send_response(206 if range_header else 200)
        self.send_header('Content-Type', self.guess_type(str(target)))
        self.send_header('Content-Length', str(end - start + 1))
        if range_header:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        return source

    def copyfile(self, source, outputfile):
        remaining = self.byte_range[1] - self.byte_range[0] + 1
        try:
            while remaining:
                data = source.read(min(1024 * 1024, remaining))
                if not data:
                    break
                outputfile.write(data)
                remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8083)
    args = parser.parse_args()
    mapping = json.loads((ROOT / 'asset-map.json').read_text(encoding='utf-8'))
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, mapping=mapping))
    print(f'Chill portfolio: http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
