export const DEFAULT_TIMES = { center: .5, left: 2.5, down: 4.5, right: 6.7, up: 9.4 };
// Inspected source transitions, including each expression's build-up and reset.
export const DEFAULT_STARTS = { center: 0, left: 39 / 24, down: 77 / 24, right: 136 / 24, up: 196 / 24 };

// A continuous two-dimensional field, not five hit regions. The radial tanh
// keeps distant pointers bounded without a hard boundary or angular seam.
export function expressionFrameAt(x, y, { fps = 24, frameCount = 240, times = DEFAULT_TIMES } = {}) {
  return Math.max(0, Math.min(frameCount - 1, rawExpressionFrameAt(x, y, fps, times)));
}

function rawExpressionFrameAt(x, y, fps, times) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return times.center * fps;
  const radius = Math.hypot(x, y);
  const scale = radius > 1e-8 ? Math.tanh(radius * 2) / radius : 2;
  x *= scale; y *= scale;
  const t = times.center + (times.right - times.left) / 2 * x + (times.down - times.up) / 2 * y
    + ((times.right + times.left) / 2 - times.center) * x * x
    + ((times.down + times.up) / 2 - times.center) * y * y;
  return t * fps;
}

// Equalize the pointer area's distribution, rather than the video's durations.
// Interpolate ranks and source boundaries continuously: no expression hit boxes.
export function createBalancedExpressionField(positions, { fps = 24, frameCount = 240, times = DEFAULT_TIMES, starts = DEFAULT_STARTS } = {}) {
  const samples = positions.map(({ x, y }) => rawExpressionFrameAt(x, y, fps, times)).filter(Number.isFinite).sort((a, b) => a - b);
  if (samples.length < 2) return (x, y) => expressionFrameAt(x, y, { fps, frameCount, times });
  const boundaries = [...Object.values(starts).map(time => time * fps).sort((a, b) => a - b), frameCount - 1];
  const count = boundaries.length - 1;
  return (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return times.center * fps;
    const value = rawExpressionFrameAt(x, y, fps, times);
    let lo = 0, hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (samples[mid] <= value) lo = mid; else hi = mid;
    }
    const span = samples[hi] - samples[lo];
    const fraction = span > 0 ? Math.max(0, Math.min(1, (value - samples[lo]) / span)) : 0;
    const rank = (lo + fraction) / (samples.length - 1);
    const scaled = Math.min(count - 1e-9, rank * count);
    const segment = Math.floor(scaled);
    return boundaries[segment] + (boundaries[segment + 1] - boundaries[segment]) * (scaled - segment);
  };
}

export function approachFrame(current, target, seconds, smoothingMs = 180, reduced = false, maxFramesPerSecond = Infinity) {
  if (reduced || smoothingMs <= 0 || Math.abs(target - current) < .025) return target;
  const dt = Math.max(0, Math.min(seconds, .05));
  const step = (target - current) * (1 - Math.exp(-dt * 1000 / smoothingMs));
  const limit = Number.isFinite(maxFramesPerSecond) ? Math.max(0, maxFramesPerSecond) * dt : Infinity;
  return current + Math.max(-limit, Math.min(limit, step));
}

export function expressionKeyAt(frame, fps = 24, times = DEFAULT_TIMES, starts = DEFAULT_STARTS) {
  return Object.keys(times).sort((a, b) => starts[a] - starts[b]).reduce((best, key) =>
    frame >= starts[key] * fps ? key : best, 'center');
}
