import { expressionFrameAt, createBalancedExpressionField, expressionKeyAt, approachFrame, DEFAULT_TIMES, DEFAULT_STARTS } from './expression-field.js';
import { createAtlasRenderer } from './atlas-renderer.js';

export class FrameFollower {
  constructor(media, poster, map, { manifestURL, reduced = false, smoothingMs = 180, maxFramesPerSecond = 72,
    onChange = () => {}, onFailure = () => {} } = {}) {
    Object.assign(this, { media, poster, map, reduced, smoothingMs, maxFramesPerSecond, onChange, onFailure });
    this.times = Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value.time ?? DEFAULT_TIMES[key]]));
    this.starts = Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value.start ?? DEFAULT_STARTS[key]]));
    this.fps = 24; this.frameCount = 240; this.frame = this.target = this.times.center * this.fps;
    this.activeKey = 'center'; this.position = { x: 0, y: 0 }; this.raf = null; this.lastTime = 0;
    this.paused = false; this.ready = false; this.failed = false; this.destroyed = false; this.renderer = null;
    this.abort = new AbortController();
    this.canvas = document.createElement('canvas'); this.canvas.className = 'aloy-expression-canvas';
    this.canvas.width = this.canvas.height = 640; this.canvas.setAttribute('aria-hidden', 'true');
    media.append(this.canvas);
    this.readyPromise = this.load(manifestURL);
  }

  async load(url) {
    try {
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok) throw new Error(`Expression manifest unavailable: ${response.status}`);
      const manifest = await response.json();
      this.fps = manifest.fps; this.frameCount = manifest.frameCount;
      const renderer = await createAtlasRenderer(this.canvas, manifest, this.abort.signal);
      if (this.destroyed) { renderer.destroy(); return; }
      this.renderer = renderer; this.ready = true;
      if (!this.paused) { this.frame = this.target; this.draw(); }
    } catch (error) {
      if (!this.destroyed && error.name !== 'AbortError') { this.failed = true; this.onFailure(error); }
    }
  }

  calibrate(positions) {
    this.field = createBalancedExpressionField(positions, { fps: this.fps, frameCount: this.frameCount, times: this.times, starts: this.starts });
  }
  setPosition(x, y) {
    if (this.destroyed) return;
    this.position = { x, y };
    const target = this.field ? this.field(x, y) : expressionFrameAt(x, y, { fps: this.fps, frameCount: this.frameCount, times: this.times });
    if (this.failed) this.showStill(expressionKeyAt(target, this.fps, this.times, this.starts));
    else this.follow(target);
  }
  request(key) {
    if (!this.map[key]) return;
    if (this.failed) this.showStill(key);
    else this.follow(this.times[key] * this.fps);
  }
  follow(target) {
    this.paused = false; this.target = target;
    if (!this.ready) return;
    if (this.reduced) { this.frame = target; this.draw(); return; }
    if (this.raf === null && Math.abs(this.target - this.frame) > 1e-6) {
      const now = performance.now(); this.lastTime = now - 1000 / 60; this.tick(now);
    }
  }
  tick(time) {
    this.raf = null;
    if (this.destroyed || this.paused || !this.ready) return;
    this.frame = approachFrame(this.frame, this.target, (time - this.lastTime) / 1000,
      this.smoothingMs, this.reduced, this.maxFramesPerSecond);
    this.lastTime = time; this.draw();
    if (this.frame !== this.target) this.raf = requestAnimationFrame(next => this.tick(next));
  }
  draw() {
    if (!this.ready || this.destroyed) return;
    try {
      this.renderer.draw(this.frame);
      if (!this.canvas.classList.contains('is-active')) { this.media.classList.add('is-live'); this.canvas.classList.add('is-active'); }
      const key = expressionKeyAt(this.frame, this.fps, this.times, this.starts);
      if (key !== this.activeKey) { this.activeKey = key; this.onChange(key); }
    } catch (error) {
      this.pause(); this.ready = false; this.failed = true; this.media.classList.remove('is-live'); this.canvas.classList.remove('is-active');
      this.onFailure(error);
    }
  }
  showStill(key = 'center') {
    if (this.destroyed || !this.map[key]) return;
    this.pause(); this.paused = false; this.frame = this.target = this.times[key] * this.fps;
    this.activeKey = key; this.onChange(key);
    if (this.ready) this.draw();
    else this.poster.src = key === 'center' ? this.poster.getAttribute('data-default-src') || this.poster.src : this.map[key].sample;
  }
  pause() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null; this.paused = true; this.target = this.frame;
  }
  setReduced(value) {
    this.reduced = value;
    if (value) {
      if (this.raf !== null) cancelAnimationFrame(this.raf);
      this.raf = null; this.frame = this.target;
      if (!this.paused) this.draw();
    }
  }
  destroy() { this.pause(); this.destroyed = true; this.abort.abort(); this.renderer?.destroy(); this.canvas.remove(); }
  get phase() { return this.failed ? 'fallback' : !this.ready ? 'loading' : this.raf !== null ? 'following' : 'holding'; }
  get state() {
    return { key: this.activeKey, phase: this.phase, continuous: true, ready: this.ready, frame: this.frame,
      targetFrame: this.target, time: this.frame / this.fps, position: this.position, paused: this.paused,
      pending: null, renderer: this.renderer?.state ?? null };
  }
}
