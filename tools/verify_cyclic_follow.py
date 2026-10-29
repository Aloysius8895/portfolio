"""Browser QA for circular pointer expressions; run from any working directory."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'template3/verification'
ORBIT = """async ({turns,steps}) => {
  const {config}=await import('/hero/config.js');
  const media=document.querySelector('.aloy-hero__media'),r=media.getBoundingClientRect(),a=config.motion.expressionArea;
  const side=Math.min(r.width,r.height),left=r.left+(r.width-side)/2,top=r.top+(r.height-side)/2;
  const cx=left+side*a.centerX,cy=top+side*a.centerY,unit=side*(a.width+a.height)/4,radius=.65*unit;
  const samples=[];
  for(let i=0;i<=steps;i++){
    const theta=turns*i/steps*Math.PI*2-Math.PI/2;
    media.dispatchEvent(new PointerEvent('pointermove',{clientX:cx+radius*Math.cos(theta),clientY:cy+radius*Math.sin(theta),pointerType:'mouse',bubbles:true}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const s=aloyHeroDebug().playback;samples.push({frame:s.frame,absolute:s.unwrappedFrame,target:s.unwrappedTargetFrame,key:s.key});
  }
  return samples;
}"""
SEAM = """async () => {
  const {config}=await import('/hero/config.js');
  const {phaseAtFrame}=await import('/hero/src/expression-field.js');
  const media=document.querySelector('.aloy-hero__media'),r=media.getBoundingClientRect(),a=config.motion.expressionArea;
  const side=Math.min(r.width,r.height),left=r.left+(r.width-side)/2,top=r.top+(r.height-side)/2;
  const radius=.65,unit=side*(a.width+a.height)/4;
  const angle=(phaseAtFrame(239.75)-phaseAtFrame(12)-.015*Math.tanh(radius-1))*Math.PI*2-Math.PI/2;
  media.dispatchEvent(new PointerEvent('pointermove',{clientX:left+side*a.centerX+radius*unit*Math.cos(angle),clientY:top+side*a.centerY+radius*unit*Math.sin(angle),pointerType:'mouse',bubbles:true}));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return aloyHeroDebug().playback;
}"""


def verify(base):
    OUT.mkdir(exist_ok=True)
    errors, bad = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: bad.append([response.status, response.url]) if response.status >= 400 else None)
        page.goto(base, wait_until='networkidle')
        page.wait_for_function('window.aloyHeroDebug && aloyHeroDebug().playback.ready', timeout=60000)
        clockwise = page.evaluate(ORBIT, {'turns': 2, 'steps': 160})
        assert all(b['absolute'] >= a['absolute'] - 1e-7 for a, b in zip(clockwise, clockwise[1:])), clockwise
        assert abs(clockwise[-1]['absolute'] - clockwise[0]['absolute'] - 480) < .01
        assert len({row['key'] for row in clockwise}) == 5
        seams = sum(b['frame'] < a['frame'] for a, b in zip(clockwise, clockwise[1:]))
        assert seams == 2, seams
        reverse = page.evaluate(ORBIT, {'turns': -1, 'steps': 80})
        assert all(b['absolute'] <= a['absolute'] + 1e-7 for a, b in zip(reverse, reverse[1:])), reverse
        assert abs(reverse[-1]['absolute'] - reverse[0]['absolute'] + 240) < .01
        seam = page.evaluate(SEAM)
        assert abs(seam['frame'] - 239.75) < .01, seam
        page.screenshot(path=str(OUT / 'cyclic-face-desktop.png'))
        page.locator('button[data-expression="up"]').evaluate('(b)=>b.click()')
        page.wait_for_function('Math.abs(aloyHeroDebug().playback.frame-225.6)<.001')
        before = page.evaluate('aloyHeroDebug().playback.unwrappedFrame')
        page.emulate_media(reduced_motion='no-preference')
        page.locator('button[data-expression="center"]').evaluate('(b)=>b.click()')
        target = page.evaluate('aloyHeroDebug().playback.unwrappedTargetFrame')
        assert 0 < target - before < 30, (before, target)
        page.wait_for_function('aloyHeroDebug().playback.phase === "holding"')
        assert abs(page.evaluate('aloyHeroDebug().playback.frame') - 12) < .001
        idle = page.evaluate('aloyHeroDebug().playback.renderer.draws')
        page.wait_for_timeout(300)
        assert page.evaluate('aloyHeroDebug().playback.renderer.draws') == idle
        assert page.locator('.aloy-hero video').count() == 0
        page.set_viewport_size({'width': 1000, 'height': 760})
        page.emulate_media(reduced_motion='reduce')
        resized = page.evaluate(ORBIT, {'turns': 1, 'steps': 60})
        assert abs(resized[-1]['absolute'] - resized[0]['absolute'] - 240) < .01
        page.locator('.aloy-next').evaluate('(b)=>b.click()')
        page.wait_for_function('!aloyHeroDebug().shown')
        assert page.evaluate('aloyHeroDebug().playback.paused')
        mobile = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', has_touch=True, is_mobile=True)
        mobile.add_init_script("const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(t==='webgl'&&this.classList.contains('aloy-expression-canvas'))return null;return get.call(this,t,...a)}")
        mobile.on('pageerror', lambda error: errors.append(str(error)))
        mobile.goto(base, wait_until='networkidle')
        mobile.wait_for_function('window.aloyHeroDebug && aloyHeroDebug().playback.ready', timeout=60000)
        for key, frame in [('up', 225.6), ('center', 12), ('left', 60), ('down', 108), ('right', 160.8)]:
            mobile.locator(f'button[data-expression="{key}"]').evaluate('(b)=>b.click()')
            mobile.wait_for_function('(f)=>Math.abs(aloyHeroDebug().playback.frame-f)<.001', arg=frame)
        mobile.screenshot(path=str(OUT / 'cyclic-face-mobile.png'))
        assert mobile.evaluate('aloyHeroDebug().playback.renderer.mode') == '2d'
        assert not errors, errors
        assert not bad, bad
        browser.close()
    report = {'base': base, 'clockwiseLaps': 2, 'clockwiseSeams': seams, 'reverseLap': True,
              'lastFrameBeforeDirectRestart': seam['frame'], 'sampleButtonWrapDistance': target - before,
              'idleStopped': True, 'resizeLap': True, 'mobileCanvas2DButtons': True,
              'galleryPause': True, 'noHeroVideo': True, 'pageErrors': errors, 'httpErrors': bad}
    (OUT / 'cyclic-face-results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:8083')
    verify(parser.parse_args().base.rstrip('/'))
