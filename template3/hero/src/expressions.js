// Coordinates refer to the actual 16:9 image, including cover cropping.
// The face center is calibrated from video1, not the whole screen's center.
// Both axes share one pixel unit, so equal mouse travel counts the same in
// every direction and the dead zone is a true circle around the face.
// `bounds` is the tracked area; it defaults to the video box but can be the
// whole hero, so pointing at copy beside the character still steers him.
export function pointerInHero(clientX, clientY, rect,
  { centerX = .5, centerY = .39, width: areaWidth = .56, height: areaHeight = .64,
    frameWidth = 1280, frameHeight = 720, fit = 'cover' } = {}, bounds = rect) {
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
  const scale = (fit === 'contain' ? Math.min : Math.max)(rect.width / frameWidth, rect.height / frameHeight);
  const width = frameWidth * scale, height = frameHeight * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  const unit = (width * areaWidth + height * areaHeight) / 4;
  return { x: (clientX - left - width * centerX) / unit,
    y: (clientY - top - height * centerY) / unit };
}

export function selectExpression(x, y, previous = 'center', { deadZone = .22, hysteresis = .07 } = {}) {
  const radius = Math.hypot(x, y);
  if (radius < deadZone - (previous === 'center' ? 0 : hysteresis)) return 'center';
  if (previous === 'center' && radius < deadZone + hysteresis) return 'center';
  if (radius < deadZone) return previous;
  const horizontal = x < 0 ? 'left' : 'right';
  const vertical = y < 0 ? 'up' : 'down';
  if (Math.abs(Math.abs(x) - Math.abs(y)) < hysteresis &&
      (previous === horizontal || previous === vertical)) return previous;
  return Math.abs(x) > Math.abs(y) ? horizontal : vertical;
}

export class ExpressionDwell {
  constructor(commit, { dwellMs = 120,
    setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimer = id => globalThis.clearTimeout(id) } = {}) {
    Object.assign(this, { commit, dwellMs, setTimer, clearTimer });
    this.candidate = null; this.timer = null; this.generation = 0;
  }
  offer(value) {
    if (value === this.candidate) return;
    this.cancel(); this.candidate = value;
    const generation = this.generation;
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (generation === this.generation) this.commit(value);
    }, this.dwellMs);
  }
  cancel() {
    this.generation++;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null; this.candidate = null;
  }
}
