export const DEFAULT_TIMES = { center: .5, left: 2.5, down: 4.5, right: 6.7, up: 9.4 };
// Inspected source transitions, including each expression's build-up and reset.
export const DEFAULT_STARTS = { center: 0, left: 39 / 24, down: 77 / 24, right: 136 / 24, up: 196 / 24 };

export const wrapCycle = (value, period = 240) => ((value % period) + period) % period;
export const nearestCycleValue = (value, reference, period = 240) => reference + wrapCycle(value - reference + period / 2, period) - period / 2;
function boundaries({ fps = 24, frameCount = 240, starts = DEFAULT_STARTS } = {}) {
  return [...Object.values(starts).map(time => time * fps).sort((a, b) => a - b), frameCount];
}

// Five equal parts of a turn, regardless of the source clips' unequal lengths.
// Values remain unwrapped, so 1.01 turns really follows .99 instead of rewinding.
export function frameAtPhase(phase, options = {}) {
  const edges = boundaries(options), count = edges.length - 1, period = edges[count];
  const lap = Math.floor(phase), scaled = (phase - lap) * count;
  const index = Math.min(count - 1, Math.floor(scaled));
  return lap * period + edges[index] + (edges[index + 1] - edges[index]) * (scaled - index);
}
export function phaseAtFrame(frame, options = {}) {
  const edges = boundaries(options), count = edges.length - 1, period = edges[count];
  const lap = Math.floor(frame / period), local = frame - lap * period;
  let index = 0;
  while (index < count - 1 && local >= edges[index + 1]) index++;
  return lap + (index + (local - edges[index]) / (edges[index + 1] - edges[index])) / count;
}
export function expressionPhaseAt(x, y, { offset = DEFAULT_TIMES.center / DEFAULT_STARTS.left / 5 } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const radius = Math.hypot(x, y);
  if (radius < .035) return null; // Angle is undefined at the face's exact center.
  return wrapCycle((Math.atan2(y, x) + Math.PI / 2) / (Math.PI * 2) + offset + .015 * Math.tanh(radius - 1), 1);
}
export function expressionFrameAt(x, y, options = {}) {
  const center = (options.times || DEFAULT_TIMES).center * (options.fps || 24);
  const phase = expressionPhaseAt(x, y, { offset: phaseAtFrame(center, options) });
  return phase === null ? center : frameAtPhase(phase, options);
}
export class PointerCycleTracker {
  constructor(options = {}) { this.options = options; this.period = options.frameCount || 240; this.reset(); }
  reset() { this.phase = null; }
  targetAt(x, y, currentFrame) {
    const center = (this.options.times || DEFAULT_TIMES).center * (this.options.fps || 24);
    const normalized = expressionPhaseAt(x, y, { offset: phaseAtFrame(center, this.options) });
    if (normalized === null) return null;
    this.phase = nearestCycleValue(normalized, this.phase ?? phaseAtFrame(currentFrame, this.options), 1);
    let target = frameAtPhase(this.phase, this.options);
    // Keep the newest pointer position; do not queue obsolete full revolutions.
    const debt = target - currentFrame;
    const laps = debt > this.period ? Math.floor(debt / this.period) : debt < -this.period ? Math.ceil(debt / this.period) : 0;
    this.phase -= laps; target -= laps * this.period;
    return target;
  }
}
export function frameBlendAt(value, frameCount = 240) {
  const frame = wrapCycle(value, frameCount), a = Math.floor(frame);
  // The source's last/first poses differ. Restart directly at the boundary
  // instead of holding a two-face crossfade when the pointer stops there.
  return a === frameCount - 1 ? { a, b: a, mix: 0 } : { a, b: a + 1, mix: frame - a };
}

export function approachFrame(current, target, seconds, smoothingMs = 180, reduced = false, maxFramesPerSecond = Infinity) {
  if (reduced || smoothingMs <= 0 || Math.abs(target - current) < .025) return target;
  const dt = Math.max(0, Math.min(seconds, .05));
  const step = (target - current) * (1 - Math.exp(-dt * 1000 / smoothingMs));
  const limit = Number.isFinite(maxFramesPerSecond) ? Math.max(0, maxFramesPerSecond) * dt : Infinity;
  return current + Math.max(-limit, Math.min(limit, step));
}

export function expressionKeyAt(frame, fps = 24, times = DEFAULT_TIMES, starts = DEFAULT_STARTS, frameCount = 240) {
  frame = wrapCycle(frame, frameCount);
  return Object.keys(times).sort((a, b) => starts[a] - starts[b]).reduce((best, key) =>
    frame >= starts[key] * fps ? key : best, 'center');
}
