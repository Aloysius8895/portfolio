"""Exercise the local reproduction with remote assets blocked."""
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen
from playwright.sync_api import sync_playwright
import json
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification'
BASE = 'http://127.0.0.1:18084'


def wait_ready():
    for _ in range(60):
        try:
            with urlopen(BASE, timeout=1) as response:
                if response.status == 200:
                    return
        except (URLError, TimeoutError):
            time.sleep(0.1)
    raise RuntimeError('Local preview did not start')


def visible_info(page):
    # Page transitions keep the outgoing info panel in the DOM for a few seconds.
    page.wait_for_function("document.querySelectorAll('.experience_info').length === 1", timeout=20000)
    return page.locator('.experience_info').inner_text()


def main():
    OUT.mkdir(exist_ok=True)
    server_log = (OUT / 'server.log').open('w', encoding='utf-8')
    server = subprocess.Popen([sys.executable, str(ROOT / 'serve.py'), '--port', '18084'], stdout=server_log, stderr=server_log)
    report = {'source': 'https://a24.raviklaassens.com/', 'base': BASE, 'checks': {}, 'viewports': [], 'page_errors': [], 'http_errors': [], 'external_requests': []}
    try:
        wait_ready()
        manifest = json.loads((ROOT / 'asset-manifest.json').read_text(encoding='utf-8'))
        paths = sorted({x['local_url'] for x in manifest['assets'] if x['file'].endswith('.html')})
        statuses = {}
        for route in paths:
            with urlopen(BASE + route, timeout=5) as response:
                statuses[route] = response.status
        report['checks']['routes'] = statuses
        # Check real bytes and HTTP semantics used by browser loaders.
        with urlopen(Request(BASE + '/fonts/PPEiko-Regular.woff2', headers={'Range': 'bytes=0-31'})) as response:
            report['checks']['range'] = {'status': response.status, 'bytes': len(response.read()), 'content_range': response.headers.get('Content-Range')}
        with urlopen(Request(BASE + '/television', method='HEAD')) as response:
            report['checks']['head'] = {'status': response.status, 'type': response.headers.get('Content-Type'), 'bytes': len(response.read())}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            for name, width, height in [('desktop', 1440, 1000), ('mobile', 390, 844)]:
                page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
                def route_request(route):
                    if route.request.url.startswith((BASE, 'data:', 'blob:')):
                        route.continue_()
                    else:
                        report['external_requests'].append(route.request.url)
                        route.abort()
                page.route('**/*', route_request)
                page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
                page.on('response', lambda response: report['http_errors'].append({'status':response.status, 'url':response.url}) if response.status >= 400 else None)
                page.goto(BASE + '/', wait_until='domcontentloaded', timeout=45000)
                page.wait_for_timeout(18000 if name == 'desktop' else 6000)
                page.screenshot(path=str(OUT / f'local-{name}.png'))
                state = {'name': name, 'title': page.title(), 'canvas': page.locator('canvas').count(), 'initial_info': visible_info(page), 'nav_visible': page.locator('.nav').is_visible()}
                page.keyboard.press('ArrowRight')
                page.wait_for_timeout(1800)
                state['arrow_right_info'] = visible_info(page)
                page.screenshot(path=str(OUT / f'local-{name}-next.png'))
                page.keyboard.press('Space')
                page.wait_for_timeout(1200)
                page.screenshot(path=str(OUT / f'local-{name}-flipped.png'))
                state['space_flip_no_navigation'] = page.url == BASE + '/'
                page.keyboard.press('Space')
                page.wait_for_timeout(800)
                page.locator('[data-dropdown-toggle]').click()
                page.wait_for_timeout(800)
                state['index_open'] = page.locator('[data-dropdown-toggle]').get_attribute('aria-expanded') == 'true'
                page.screenshot(path=str(OUT / f'local-{name}-index.png'))
                page.locator('[data-film-scroll="Marty Supreme"]').click()
                page.wait_for_timeout(2000)
                state['index_selection_info'] = visible_info(page)
                page.locator('canvas').focus()
                page.keyboard.press('Enter')
                page.wait_for_url('**/production/marty-supreme', timeout=15000)
                page.wait_for_timeout(2500)
                state['detail_path'] = page.url.removeprefix(BASE)
                state['detail_title'] = page.title()
                state['hero_visible'] = page.locator('[data-production-hero]').is_visible()
                page.screenshot(path=str(OUT / f'local-{name}-detail.png'))
                page.locator('[data-trailer-src]').scroll_into_view_if_needed()
                page.wait_for_timeout(1500)
                state['trailer_url'] = page.locator('[data-trailer-src]').get_attribute('data-trailer-src')
                page.screenshot(path=str(OUT / f'local-{name}-trailer-section.png'))
                page.locator('.nav a[href="/television"]').click()
                page.wait_for_url('**/television', timeout=15000)
                page.wait_for_timeout(5000)
                state['television_title'] = page.title()
                state['television_canvas'] = page.locator('canvas').count()
                state['television_info'] = visible_info(page)
                page.screenshot(path=str(OUT / f'local-{name}-television.png'))
                page.locator('.nav a[href="/"]').last.click()
                page.wait_for_url(BASE + '/', timeout=15000)
                page.wait_for_timeout(3500)
                state['films_return_info'] = visible_info(page)
                report['viewports'].append(state)
                print(json.dumps(state, ensure_ascii=True), flush=True)
                page.close()
            browser.close()
        assert all(status == 200 for status in statuses.values())
        assert report['checks']['range']['status'] == 206
        assert report['checks']['range']['bytes'] == 32
        assert report['checks']['head']['bytes'] == 0
        for state in report['viewports']:
            assert state['canvas'] == 1 and state['television_canvas'] == 1
            assert 'Backrooms' in state['initial_info'] or 'BACKROOMS' in state['initial_info']
            assert 'The Invite' in state['arrow_right_info'] or 'THE INVITE' in state['arrow_right_info']
            assert 'Marty Supreme' in state['index_selection_info'] or 'MARTY SUPREME' in state['index_selection_info']
            assert state['index_open']
            assert state['space_flip_no_navigation']
            assert state['hero_visible']
        assert not report['page_errors'], report['page_errors']
        assert not report['http_errors'], report['http_errors']
        assert not report['external_requests'], report['external_requests']
        report['passed'] = True
    except Exception:
        report['passed'] = False
        report['failure'] = traceback.format_exc()
        print(report['failure'], flush=True)
    finally:
        server.terminate()
        server.wait(timeout=10)
        server_log.close()
        (OUT / 'results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(report, indent=2, ensure_ascii=True))
    if not report.get('passed'):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
