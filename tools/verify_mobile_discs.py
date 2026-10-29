"""Exercise Safari/WebKit and Chromium graphics failure recovery without a phone."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'template3/verification'
NO_GALLERY_GL = """const get=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(t,...args){
 if((t==='webgl'||t==='webgl2')&&!this.classList.contains('aloy-expression-canvas'))return null;
 return get.call(this,t,...args);
};"""


def verify(base):
    OUT.mkdir(exist_ok=True)
    results = []
    with sync_playwright() as p:
        for name, engine in [('webkit', p.webkit), ('chromium', p.chromium)]:
            browser = engine.launch(headless=True)
            for failure in ['context-loss', 'no-webgl']:
                page = browser.new_page(viewport={'width': 393, 'height': 852}, device_scale_factor=3,
                                        is_mobile=True, has_touch=True)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                if failure == 'no-webgl':
                    page.add_init_script(NO_GALLERY_GL)
                page.goto(base, wait_until='networkidle')
                page.wait_for_function('window.aloyHeroDebug')
                page.locator('.aloy-next').evaluate('(b)=>b.click()')
                page.wait_for_function('!aloyHeroDebug().shown')
                page.wait_for_function('aloyHeroDebug().playback.renderer === null')
                if failure == 'context-loss':
                    page.wait_for_function("document.querySelector('[data-disc-gallery]').discGalleryDebug?.state().ready")
                    state = page.evaluate("document.querySelector('[data-disc-gallery]').discGalleryDebug.state()")
                    assert state['artResolution'] <= 512, state
                    assert not page.evaluate('aloyHeroDebug().discSafety.active')
                    page.wait_for_function("!document.querySelector('[data-disc-gallery]').hasAttribute('data-disc-flight')")
                    assert page.locator('[data-disc-canvas] canvas').evaluate('(c)=>getComputedStyle(c).opacity') == '1'
                    page.evaluate("document.querySelector('[data-disc-gallery]').discGalleryNav.goTo(2)")
                    page.wait_for_function("document.querySelector('[data-film-target=title]').textContent.trim()==='MetriX AI (1st Runner up)'")
                    page.evaluate("document.querySelector('[data-disc-gallery]').discGalleryDebug.renderer.forceContextLoss()")
                page.wait_for_function('aloyHeroDebug().discSafety.active', timeout=20000)
                page.wait_for_selector('.aloy-disc-fallback.is-ready')
                if failure == 'context-loss':
                    assert page.evaluate('aloyHeroDebug().discSafety.index') == 2
                page.evaluate("document.querySelector('[data-disc-gallery]').discGalleryNav.goTo(0)")
                page.get_by_role('button', name='Next project', exact=True).click()
                page.wait_for_function('aloyHeroDebug().discSafety.index===1')
                assert page.locator('[data-film-target="title"]').first.text_content().strip() == 'ItFitS'
                page.locator('.aloy-disc-fallback__link').evaluate("""link=>{
                  link.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,isPrimary:true,pointerType:'touch',clientX:300,clientY:400,bubbles:true}));
                  link.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,isPrimary:true,pointerType:'touch',clientX:50,clientY:400,bubbles:true}));
                }""")
                assert page.evaluate('aloyHeroDebug().discSafety.index') == 2
                page.locator('[data-dropdown-toggle]').click()
                page.wait_for_timeout(700)
                page.locator('[data-film-scroll="Peer Tutoring"]').click()
                page.wait_for_function('aloyHeroDebug().discSafety.index===8')
                assert page.locator('[data-film-scroll="Peer Tutoring"]').get_attribute('aria-current') == 'true'
                assert 'peer-tutoring' in page.locator('.aloy-disc-fallback__link').get_attribute('href')
                if page.locator('[data-dropdown-toggle]').get_attribute('aria-expanded') == 'true':
                    page.locator('[data-dropdown-toggle]').click()
                page.wait_for_function("document.querySelector('.nav-dropdown').getAttribute('aria-hidden')==='true'")
                page.wait_for_timeout(600)
                page.evaluate("document.querySelector('[data-disc-gallery]').discGalleryNav.goTo(0)")
                page.wait_for_selector('.aloy-disc-fallback.is-ready')
                page.screenshot(path=str(OUT / f'mobile-disc-{name}-{failure}.png'))
                page.locator('.aloy-return').click()
                page.wait_for_function('aloyHeroDebug().shown && aloyHeroDebug().progress===0')
                page.wait_for_function('aloyHeroDebug().playback.ready', timeout=30000)
                page.locator('button[data-expression="up"]').evaluate('(b)=>b.click()')
                page.wait_for_function('Math.abs(aloyHeroDebug().playback.frame-225.6)<.001')
                page.locator('.aloy-next').evaluate('(b)=>b.click()')
                page.wait_for_function('!aloyHeroDebug().shown')
                page.wait_for_function('aloyHeroDebug().playback.renderer===null')
                assert page.locator('.aloy-disc-fallback.is-ready').is_visible()
                page.set_viewport_size({'width': 852, 'height': 393})
                page.wait_for_timeout(250)
                assert page.locator('.aloy-disc-fallback__link').is_visible()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.locator('.aloy-disc-fallback__link').click()
                page.wait_for_url('**/production/kerjayaku')
                assert 'KerjayaKu' in page.title()
                assert not errors, errors
                results.append({'engine': name, 'scenario': failure, 'recovery': True, 'portraitMemoryReleased': True,
                                'buttonsSwipeIndex': True, 'portraitReturn': True, 'landscape': True, 'projectLink': True,
                                'pageErrors': errors})
                print(json.dumps(results[-1]), flush=True)
                page.close()
            browser.close()
    (OUT / 'mobile-disc-results.json').write_text(json.dumps({'base': base, 'scenarios': results}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:8083')
    verify(parser.parse_args().base.rstrip('/'))
