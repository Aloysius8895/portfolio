// A failed WebGL surface must not turn the portfolio into a metadata-only page.
// This controller takes ownership only after loss/failure, preserving the native
// gallery and all of its visual behavior while it is healthy.
export function createDiscFallback(gallery) {
  if (!gallery) return { handover() {}, destroy() {}, get state() { return { active: false }; } };
  const host = gallery.querySelector('[data-disc-canvas]');
  if (matchMedia('(pointer: coarse), (max-width: 767px)').matches) {
    gallery.setAttribute('data-disc-art-resolution', '512');
    gallery.setAttribute('data-disc-render-radius', '2');
    gallery.setAttribute('data-disc-preload-radius', '2');
  }
  const projects = [...gallery.querySelectorAll('[data-film-item]')].map(item => {
    const values = key => [...item.querySelectorAll(`[data-film-field="${key}"]`)].map(node => node.textContent.trim()).filter(Boolean);
    return { title: values('title')[0], artwork: values('disc-art-url')[0], year: values('year')[0],
      category: values('directors'), stack: values('starring'), context: values('review-publication')[0] || '',
      pitch: values('review-testimonial')[0] || '', url: item.querySelector('[data-film-field="detail-url"]')?.getAttribute('href') };
  }).filter(project => project.title && project.artwork);
  let active = false, destroyed = false, index = 0, reason = '', shownAt = 0, imageRequest = 0, drag = null, suppressClick = 0, lastWheel = 0;
  const abort = new AbortController(), watched = new WeakSet();
  const listen = (target, event, handler, options = {}) => target?.addEventListener(event, handler, { ...options, signal: abort.signal });
  const root = document.createElement('div'); root.className = 'aloy-disc-fallback'; root.hidden = true;
  root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Project disks');
  const link = document.createElement('a'); link.className = 'aloy-disc-fallback__link'; link.setAttribute('data-barba-prevent', '');
  const visual = document.createElement('span'); visual.className = 'aloy-disc-fallback__visual';
  const image = document.createElement('img'); image.draggable = false; image.decoding = 'async';
  visual.append(image); link.append(visual);
  const controls = document.createElement('div'); controls.className = 'aloy-disc-fallback__controls';
  const prev = document.createElement('button'), next = document.createElement('button'), counter = document.createElement('span');
  prev.type = next.type = 'button'; prev.textContent = '←'; next.textContent = '→';
  prev.setAttribute('aria-label', 'Previous project'); next.setAttribute('aria-label', 'Next project');
  counter.setAttribute('aria-live', 'polite'); controls.append(prev, counter, next);
  const loading = document.createElement('p'); loading.className = 'aloy-disc-fallback__message'; loading.textContent = 'Loading project artwork…';
  const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'aloy-disc-fallback__retry'; retry.textContent = 'Retry artwork'; retry.hidden = true;
  root.append(link, controls, loading, retry); host?.append(root);

  function write(field, values) {
    for (const node of gallery.querySelectorAll(`[data-film-target="${field}"]`)) {
      node.replaceChildren();
      (Array.isArray(values) ? values : [values || '']).forEach((value, at) => {
        if (at) node.append(document.createElement('br'));
        node.append(document.createTextNode(value));
      });
    }
  }
  function select(nextIndex) {
    if (!projects.length || destroyed) return;
    index = Math.max(0, Math.min(projects.length - 1, Math.round(nextIndex)));
    const project = projects[index];
    write('title', project.title); write('primary-credit', project.category); write('year', project.year); write('starring', project.stack);
    write('review-publication', project.context); write('review-testimonial', project.pitch);
    link.href = project.url || '#'; link.setAttribute('aria-label', `View ${project.title}`);
    image.alt = `${project.title} disk`; prev.disabled = index === 0; next.disabled = index === projects.length - 1;
    counter.textContent = `${index + 1} / ${projects.length}`;
    gallery.querySelectorAll('[data-film-counter]').forEach(node => {
      node.textContent = String(node.getAttribute('data-film-counter') === 'current' ? index + 1 : projects.length);
    });
    loadImage(project.artwork);
    layout();
    gallery.dispatchEvent(new CustomEvent('discgallerychange', { bubbles: true, detail: { index, film: project } }));
  }
  function loadImage(url) {
    const request = ++imageRequest; loading.hidden = false; retry.hidden = true;
    root.classList.remove('is-ready');
    image.onload = () => { if (request !== imageRequest) return; loading.hidden = true; root.classList.add('is-ready'); };
    image.onerror = () => { if (request !== imageRequest) return; root.classList.remove('is-ready'); loading.hidden = false; loading.textContent = 'Project artwork could not load.'; retry.hidden = false; };
    loading.textContent = 'Loading project artwork…'; image.src = url;
  }
  function layout() {
    if (!active || !host) return;
    const box = host.getBoundingClientRect(), info = gallery.querySelector('.experience_info')?.getBoundingClientRect();
    const nav = document.querySelector('.nav')?.getBoundingClientRect();
    const top = Math.max(0, (info?.bottom || box.top) - box.top) + 18;
    const bottom = Math.min(box.height - 40, (nav?.top || box.bottom) - box.top - 60);
    const space = Math.max(100, bottom - top), size = Math.max(90, Math.min(box.width * .76, space * .86, 500));
    root.style.setProperty('--fallback-size', `${size}px`);
    root.style.setProperty('--fallback-y', `${Math.min(box.height - 100, top + space / 2)}px`);
  }
  function activate(why) {
    if (active || destroyed || !host || !projects.length || !gallery.isConnected || location.pathname !== '/') return;
    const native = gallery.discGalleryDebug?.renderer;
    const selectedTitle = gallery.querySelector('[data-film-target="title"]')?.textContent.trim();
    const selected = projects.findIndex(project => project.title === selectedTitle);
    index = selected >= 0 ? selected : 0; active = true; reason = why;
    // The original controller exposes page-lifecycle cleanups. Hand off input
    // and release the failed scene rather than running two competing galleries.
    try { if (native && !native.getContext().isContextLost()) native.forceContextLoss(); } catch {}
    for (const [key, cleanup] of Object.entries(window.siteCleanups || {})) if (/^discGallery\d+$/.test(key) && typeof cleanup === 'function') cleanup();
    gallery.removeAttribute('data-disc-flight'); gallery.setAttribute('data-disc-ready', 'true');
    gallery.setAttribute('data-disc-fallback', 'true'); gallery.tabIndex = 0;
    gallery.setAttribute('role', 'region'); gallery.setAttribute('aria-label', 'Projects');
    gallery.discGalleryNav = { prev: () => select(index - 1), next: () => select(index + 1), goTo: select, index: () => index, count: () => projects.length };
    // The native renderer replaces the host's children during initialization.
    if (root.parentNode !== host) host.append(root);
    root.hidden = false; select(index);
  }
  function watch() {
    if (destroyed || active || !gallery.isConnected || location.pathname !== '/') return;
    const canvas = host?.querySelector('canvas');
    if (canvas && !watched.has(canvas)) {
      watched.add(canvas); listen(canvas, 'webglcontextlost', () => activate('context-lost'));
    }
    const context = gallery.discGalleryDebug?.renderer?.getContext();
    if (context?.isContextLost()) { activate('context-lost'); return; }
    if (!document.documentElement.classList.contains('aloy-on-discs')) { shownAt = 0; return; }
    shownAt ||= performance.now();
    if (performance.now() - shownAt > 6000 && !gallery.hasAttribute('data-disc-ready')) activate('renderer-unavailable');
    else if (performance.now() - shownAt > 9000 && gallery.hasAttribute('data-disc-flight')) activate('renderer-stalled');
    else if (canvas && performance.now() - shownAt > 2000 && Number(getComputedStyle(canvas).opacity) === 0) {
      canvas.classList.remove('aloy-disc-pending'); canvas.getAnimations().forEach(animation => animation.cancel());
      window.dispatchEvent(new Event('resize'));
    }
  }
  const observer = new MutationObserver(watch); if (host) observer.observe(host, { childList: true, subtree: true });
  const timer = setInterval(watch, 500); watch();
  listen(prev, 'click', () => select(index - 1)); listen(next, 'click', () => select(index + 1));
  listen(retry, 'click', () => { const url = new URL(projects[index].artwork, location.href); url.searchParams.set('retry', String(Date.now())); loadImage(url.href); });
  listen(root, 'pointerdown', event => { if (event.target.closest('button') || !event.isPrimary) return; drag = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
  listen(window, 'pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const x = event.clientX - drag.x, y = event.clientY - drag.y; drag = null;
    if (Math.abs(x) > 35 && Math.abs(x) > Math.abs(y) * 1.1) { suppressClick = performance.now() + 500; select(index + (x < 0 ? 1 : -1)); }
  });
  listen(window, 'pointercancel', () => { drag = null; });
  listen(link, 'click', event => { if (performance.now() < suppressClick) { event.preventDefault(); event.stopPropagation(); } });
  listen(gallery, 'wheel', event => {
    if (!active || !document.documentElement.classList.contains('aloy-on-discs') || event.target.closest('.nav')) return;
    event.preventDefault(); event.stopPropagation();
    if (performance.now() - lastWheel < 280 || Math.abs(event.deltaY) < 3) return;
    lastWheel = performance.now(); select(index + Math.sign(event.deltaY));
  }, { passive: false });
  listen(gallery, 'keydown', event => {
    if (!active || event.target.closest('button,a,input,textarea')) return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowLeft') select(index - 1);
    if (event.key === 'ArrowRight') select(index + 1);
    if (event.key === 'Home') select(0);
    if (event.key === 'End') select(projects.length - 1);
    if (event.key === 'Enter') link.click();
  });
  listen(gallery, 'discgallerynavigate', event => { if (active) { const at = projects.findIndex(p => p.title.toLowerCase() === String(event.detail?.title || '').toLowerCase()); if (at >= 0) select(at); } });
  listen(window, 'resize', layout);
  listen(window.visualViewport, 'resize', layout);
  listen(window, 'pageshow', () => { if (active) layout(); else { watch(); window.dispatchEvent(new Event('resize')); } });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) return;
    if (active) layout(); else { watch(); window.dispatchEvent(new Event('resize')); }
  });
  return {
    handover() { shownAt = performance.now(); if (active) layout(); else { watch(); window.dispatchEvent(new Event('resize')); } },
    destroy() { destroyed = true; abort.abort(); observer.disconnect(); clearInterval(timer); root.remove(); if (active) delete gallery.discGalleryNav; },
    get state() { return { active, reason, index, count: projects.length }; },
  };
}

// Barba can replace the gallery without a full page load.
export function createDiscSafety() {
  let gallery = null, controller = null;
  function sync() {
    const next = document.querySelector('[data-disc-gallery]');
    if (next === gallery) return;
    controller?.destroy(); gallery = next; controller = next ? createDiscFallback(next) : null;
  }
  const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true }); sync();
  return { handover() { controller?.handover(); }, destroy() { observer.disconnect(); controller?.destroy(); },
    get state() { return controller?.state || { active: false }; } };
}
