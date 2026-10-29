import { config } from './config.js';
import { pointerInHero } from './src/expressions.js';
import { FrameFollower } from './src/frame-follower.js';
import { createDiscReveal } from './src/disc-reveal.js';

// The intro and the disc gallery read as one page: a single progress value
// (0 = intro, 1 = discs) follows the wheel/touch like a scroll position, and
// CSS drives both scenes from it (--aloy-out / --aloy-in). The disc gallery
// captures every wheel event over itself, so real page scrolling cannot be
// used; at 1 the gallery takes over, and an upward gesture on its first disc
// runs the same motion back. Expression logic follows the portfolio hero.
function startHero() {
  const hero = document.querySelector('.aloy-hero');
  const back = document.querySelector('.aloy-return');
  if (!hero) return;
  if (location.pathname !== '/') { hero.remove(); back?.remove(); return; }

  const media = hero.querySelector('.aloy-hero__media');
  const poster = hero.querySelector('.aloy-hero__poster');
  const buttons = [...hero.querySelectorAll('[data-expression]')];
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const fineQuery = matchMedia('(any-pointer: fine)');
  const coarseQuery = matchMedia('(pointer: coarse)');
  const root = document.documentElement;
  const discReveal = createDiscReveal(document.querySelector('[data-disc-gallery]'), reducedQuery);
  let reduced = reducedQuery.matches;
  let shown = true; // The intro owns input (at rest or mid-transition).
  let selected = 'center';
  let direction = 'center';
  let pointer = null;
  let frame = null;
  let goal = 0, prog = 0, motionFrame = null, lastFrameAt = 0, lastDir = 1, snapTimer = null;
  let swallowing = false, swallowTimer = null, swallowFloor = 0;
  let touchStart = null;
  let lastWheelAt = 0, backTouch = null;
  let shownTitle = null, titleChangedAt = 0;
  hero.querySelectorAll('[data-person]').forEach(node => {
    const value = config.person[node.dataset.person];
    if (value) node.textContent = value;
  });
  const github = hero.querySelector('[data-person-link="github"]');
  if (github && config.person.github) {
    github.href = config.person.github;
    github.textContent = config.person.github.replace(/^https?:\/\/(www\.)?/, '');
  }
  if (coarseQuery.matches) hero.querySelector('.aloy-hint').textContent = 'Tap a sample expression';

  buttons.forEach(button => {
    const label = config.expressionMap[button.dataset.expression].label;
    button.title = label; button.setAttribute('aria-label', label);
  });
  const player = new FrameFollower(media, poster, config.expressionMap, {
    reduced, manifestURL: config.media.atlasManifest, smoothingMs: config.motion.followSmoothingMs,
    maxFramesPerSecond: config.motion.followMaxFramesPerSecond,
    onChange(key) {
      selected = direction = key; hero.dataset.expression = key;
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.expression === key)));
    },
    onFailure(error) { console.info('Continuous expression rendering unavailable; retaining a still portrait.', error); },
  });

  function chooseExpression(key, animate = true) {
    if (!shown || prog > 0 || document.hidden) return;
    if (animate) player.request(key);
    else player.showStill(key);
  }

  function schedule() {
    if (frame === null && shown && prog === 0 && !document.hidden) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = null;
    if (!pointer || !shown || prog > 0) return;
    // Read both boxes per frame: they are cheap, and never go stale on resize.
    const position = pointerInHero(pointer.x, pointer.y, media.getBoundingClientRect(),
      config.motion.expressionArea, hero.getBoundingClientRect());
    player.setPosition(position?.x ?? 0, position?.y ?? 0);
    pointer = null;
  }

  // Page chrome behind the cover must not take focus or clicks while it shows.
  function setBackdropInert(value) {
    document.querySelectorAll('body > .page-wrapper').forEach(node => { node.inert = value; });
  }
  // ---- One-page motion -------------------------------------------------
  const clamp = value => Math.min(1, Math.max(0, value));
  const smooth = t => t * t * (3 - 2 * t);
  function render() {
    // The intro leaves over the first 75% and the discs arrive over the last
    // 75%, so both are on screen together in the middle of the scroll.
    root.style.setProperty('--aloy-out', smooth(clamp(prog / .75)).toFixed(4));
    root.style.setProperty('--aloy-in', smooth(clamp((prog - .25) / .75)).toFixed(4));
    discReveal.update(prog);
  }
  function seek(target) {
    target = clamp(target);
    if (prog === 0 && target > 0) {
      // Leaving the rest position: hold the current face, stop following the mouse.
      pointer = null; player.pause();
    }
    goal = target;
    if (motionFrame === null) motionFrame = requestAnimationFrame(animate);
  }
  function animate(now) {
    motionFrame = null;
    const dt = Math.min(64, now - (lastFrameAt || now - 16.7));
    lastFrameAt = now;
    // Frame-rate independent easing toward the goal, like smooth scrolling.
    prog += (goal - prog) * (reduced ? 1 : 1 - Math.pow(1 - .13, dt / 16.7));
    if (Math.abs(goal - prog) < .0015) prog = goal;
    render();
    if (prog !== goal) { motionFrame = requestAnimationFrame(animate); return; }
    lastFrameAt = 0;
    if (prog === 1 && shown) handover();
    else if (prog === 0 && shown) { direction = 'center'; chooseExpression('center', false); }
  }
  // After a gesture stops, settle at the end it was heading for.
  function snap() {
    if (goal <= 0 || goal >= 1) return;
    seek(lastDir > 0 ? (goal > .03 ? 1 : 0) : (goal < .97 ? 0 : 1));
  }
  function scrubBy(pixels) {
    if (!pixels) return;
    lastDir = Math.sign(pixels);
    seek(goal + pixels / (innerHeight * config.motion.scrollScreens));
    clearTimeout(snapTimer); snapTimer = setTimeout(snap, 140);
  }
  function handover() {
    shown = false; player.pause();
    root.classList.add('aloy-on-discs');
    hero.classList.add('is-dismissed');
    hero.inert = true; hero.setAttribute('aria-hidden', 'true');
    setBackdropInert(false);
    if (back && location.pathname === '/') back.hidden = false;
    // Trackpad inertia keeps firing after the intro leaves; without this the
    // gallery would receive it and skip several discs at once.
    swallowing = true; swallowFloor = performance.now() + 500;
    clearTimeout(swallowTimer); swallowTimer = setTimeout(endSwallow, 500);
    document.querySelector('[data-disc-gallery]')?.focus({ preventScroll: true });
  }
  function endSwallow() {
    if (performance.now() < swallowFloor) { swallowTimer = setTimeout(endSwallow, swallowFloor - performance.now()); return; }
    swallowing = false;
  }
  function jumpToDiscs() {
    if (!shown) return;
    goal = prog = 1; render(); handover();
  }
  function show() {
    if (shown || location.pathname !== '/') return;
    shown = true;
    root.classList.remove('aloy-on-discs'); // --aloy-in is still 1: no jump.
    hero.classList.remove('is-dismissed');
    hero.inert = false; hero.removeAttribute('aria-hidden');
    setBackdropInert(true);
    if (back) back.hidden = true;
    lastDir = -1; seek(0);
    hero.querySelector('.aloy-next')?.focus({ preventScroll: true });
  }

  window.addEventListener('pointermove', event => {
    if (!shown || prog > 0 || !fineQuery.matches || !['mouse', 'pen'].includes(event.pointerType) || document.hidden) return;
    // Only the expression buttons pause tracking; the rest of the cover steers him.
    if (event.target.closest('.aloy-picker')) { pointer = null; return; }
    pointer = { x: event.clientX, y: event.clientY }; schedule();
  }, { passive: true, capture: true });
  document.documentElement.addEventListener('pointerleave', event => {
    if (!shown || prog > 0 || !['mouse', 'pen'].includes(event.pointerType)) return;
    pointer = null; direction = 'center'; chooseExpression('center');
  });
  buttons.forEach(button => {
    button.addEventListener('pointerenter', () => { pointer = null; });
    button.addEventListener('click', () => {
      pointer = null; direction = button.dataset.expression;
      chooseExpression(direction);
    });
  });

  // The disc page has no scroll position of its own, so "scrolling back up"
  // means: an upward gesture while the gallery rests on its first disc.
  // Elsewhere an upward wheel still steps to the previous disc as before.
  const titleText = selector => document.querySelector(selector)?.textContent.trim().toLowerCase() ?? '';
  const atFirstDisc = () => {
    const first = titleText('[data-film-item] [data-film-field="title"]');
    return !!first && titleText('[data-film-target="title"]') === first &&
      performance.now() - titleChangedAt > 400; // Not mid-way through a disc change.
  };
  setInterval(() => {
    if (shown || location.pathname !== '/') return;
    const title = titleText('[data-film-target="title"]');
    if (title !== shownTitle) { shownTitle = title; titleChangedAt = performance.now(); }
  }, 120);
  const canReturn = () => !shown && location.pathname === '/' &&
    !document.documentElement.matches('[data-trailer-open="true"]') && atFirstDisc();

  // Window capture runs before the gallery's own capture listener.
  window.addEventListener('wheel', event => {
    const now = performance.now();
    const gestureStart = now - lastWheelAt > 220;
    lastWheelAt = now;
    if (swallowing) {
      event.preventDefault(); event.stopImmediatePropagation();
      clearTimeout(swallowTimer); swallowTimer = setTimeout(endSwallow, 220);
      return;
    }
    if (!shown) {
      // Only a fresh gesture returns; momentum that lands on disc one does not.
      if (gestureStart && event.deltaY < 0 && !event.target.closest?.('.nav') && canReturn()) {
        event.preventDefault(); event.stopImmediatePropagation(); show();
      }
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    scrubBy(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1));
  }, { passive: false, capture: true });
  // Touch drags the same progress, finger up = forward.
  hero.addEventListener('touchstart', event => {
    const t = event.touches[0];
    touchStart = t ? { y: t.clientY, goal } : null;
  }, { passive: true });
  hero.addEventListener('touchmove', event => {
    const t = event.touches[0];
    if (!touchStart || !t || !shown) return;
    const target = touchStart.goal + (touchStart.y - t.clientY) / (innerHeight * config.motion.scrollScreens);
    lastDir = target >= goal ? 1 : -1;
    seek(target);
  }, { passive: true });
  hero.addEventListener('touchend', () => { touchStart = null; snap(); }, { passive: true });
  // Swiping down on the first disc mirrors the upward wheel.
  window.addEventListener('touchstart', event => {
    const t = event.touches[0];
    backTouch = !shown && t && !event.target.closest?.('.nav') ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true, capture: true });
  window.addEventListener('touchmove', event => {
    const t = event.touches[0];
    if (!backTouch || !t) return;
    const dy = t.clientY - backTouch.y, dx = Math.abs(t.clientX - backTouch.x);
    if (dy > 80 && dx < dy * .6 && canReturn()) { backTouch = null; show(); }
  }, { passive: true, capture: true });
  window.addEventListener('keydown', event => {
    if (!shown) {
      const typing = event.target.closest?.('input, textarea, select, [contenteditable], .nav');
      if (!typing && ['ArrowUp', 'PageUp'].includes(event.key) && location.pathname === '/' &&
          !document.documentElement.matches('[data-trailer-open="true"]')) {
        event.preventDefault(); event.stopImmediatePropagation(); show();
      }
      return;
    }
    const onControl = event.target.closest?.('.aloy-hero button, .aloy-hero a');
    if (['ArrowDown', 'PageDown'].includes(event.key) || (event.key === ' ' && !onControl)) {
      event.preventDefault(); event.stopImmediatePropagation(); lastDir = 1; seek(1); return;
    }
    if (['ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); lastDir = -1; seek(0); }
    // Keep the hidden gallery from reacting to arrows/space/enter behind the cover.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key) ||
        (['Enter', ' '].includes(event.key) && !onControl)) event.stopImmediatePropagation();
  }, { capture: true });
  hero.querySelector('.aloy-next')?.addEventListener('click', () => { lastDir = 1; seek(1); });
  back?.addEventListener('click', show);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pointer = null; player.pause(); }
    else if (shown) chooseExpression('center', false);
  });
  reducedQuery.addEventListener('change', () => {
    reduced = reducedQuery.matches;
    player.setReduced(reduced);
  });
  // Barba swaps pages without reloading; the return button belongs to Films only.
  const syncRoute = () => {
    if (location.pathname !== '/') { jumpToDiscs(); if (back) back.hidden = true; }
    else if (back) back.hidden = shown;
  };
  window.addEventListener('popstate', () => setTimeout(syncRoute, 0));
  let barbaTries = 0;
  (function hookBarba() {
    if (window.barba?.hooks) { window.barba.hooks.after(syncRoute); return; }
    if (++barbaTries < 50) setTimeout(hookBarba, 200);
  })();
  window.addEventListener('pageshow', () => { if (shown) chooseExpression('center', false); });
  window.addEventListener('pagehide', event => {
    player.pause();
    if (!event.persisted) { discReveal.destroy(); player.destroy(); }
  });

  poster.src = config.media.heroPoster;
  setBackdropInert(true);
  render();
  root.classList.add('aloy-hero-ready');
  chooseExpression('center', false);

  // Read-only diagnostics for manual QA.
  window.aloyHeroDebug = () => ({ shown, progress: +prog.toFixed(3), selected, direction, reducedMotion: reduced,
    displayedExpression: player.activeKey, heroPhase: player.phase,
    heroTime: player.state.time, expressionFrame: player.state.frame, queuedExpression: null,
    playback: player.state, discReveal: discReveal.state });
}

try { startHero(); }
catch (error) {
  document.documentElement.classList.remove('aloy-js'); // Un-hide the disc layer.
  document.querySelector('.aloy-hero')?.remove();
  document.querySelector('.aloy-return')?.remove();
  console.error('Intro hero could not start; the disc page remains usable.', error);
}
