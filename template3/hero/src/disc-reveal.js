// The gallery stays fixed, so use the intro's virtual scroll progress rather
// than viewport intersection (which would trigger behind the intro cover).
export function createDiscReveal(gallery, preference) {
  let played = false;
  let disabled = preference.matches || typeof Element.prototype.animate !== 'function';
  let destroyed = false;
  let canvasObserver = null;
  let progress = 0;
  const readyObserver = new MutationObserver(tryReveal);
  const targets = new Set();
  const pending = new Map();
  const motions = new Set();
  const abort = new AbortController();

  function reveal(node, delay) {
    pending.delete(node);
    node.classList.remove('aloy-disc-pending');
    const motion = node.animate([
      { opacity: 0, translate: '0 18px' },
      { opacity: 1, translate: '0 0' },
    ], { duration: 650, delay, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'both' });
    motions.add(motion);
    motion.finished.then(() => {
      // Release animation-owned styles so the original gallery keeps full
      // control of project switching, text transitions and WebGL transforms.
      motion.cancel();
      motions.delete(motion);
    }, () => motions.delete(motion));
  }

  function prepare(node, delay) {
    if (!node || disabled || destroyed || targets.has(node)) return;
    targets.add(node);
    node.classList.add('aloy-disc-pending');
    pending.set(node, delay);
    if (played) reveal(node, delay);
  }

  function clear() {
    canvasObserver?.disconnect();
    readyObserver.disconnect();
    for (const node of targets) node.classList.remove('aloy-disc-pending');
    for (const motion of motions) motion.cancel();
    motions.clear();
    pending.clear();
  }

  if (gallery && !disabled) {
    // A quick scroll during loading must not play the reveal behind the
    // original preloader. Its two attributes signal when copy is released.
    readyObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-preload'] });
    readyObserver.observe(gallery, { attributes: true, attributeFilter: ['data-disc-flight'] });
    prepare(gallery.querySelector('.experience_info > [data-film-target="title"]'), 0);
    gallery.querySelectorAll('.info-content_panel').forEach((node, index) => prepare(node, 90 + index * 90));
    prepare(gallery.querySelector('.testimonial_wrap'), 300);

    const canvasHost = gallery.querySelector('[data-disc-canvas]');
    const prepareCanvas = () => {
      const canvas = canvasHost?.querySelector('canvas');
      if (!canvas) return;
      // iOS can drop an idle WebGL layer while its own opacity is animated.
      // The gallery host already participates in the intro transition.
      if (!matchMedia('(pointer: coarse)').matches) prepare(canvas, 360);
      canvasObserver?.disconnect();
    };
    if (canvasHost) {
      canvasObserver = new MutationObserver(prepareCanvas);
      canvasObserver.observe(canvasHost, { childList: true, subtree: true });
      prepareCanvas();
    }
  }

  preference.addEventListener('change', () => {
    if (!preference.matches) return;
    disabled = true;
    clear();
  }, { signal: abort.signal });

  function tryReveal() {
    if (destroyed || played || progress < .4 || document.documentElement.hasAttribute('data-preload') ||
        gallery?.hasAttribute('data-disc-flight')) return;
    played = true;
    readyObserver.disconnect();
    if (!disabled) for (const [node, delay] of pending) reveal(node, delay);
  }

  return {
    update(value) {
      progress = value;
      tryReveal();
    },
    destroy() { destroyed = true; abort.abort(); clear(); },
    get state() { return { played, disabled, pending: pending.size, animating: motions.size }; },
  };
}
