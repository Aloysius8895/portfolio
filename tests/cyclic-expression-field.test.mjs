import test from 'node:test';
import assert from 'node:assert/strict';
import { expressionFrameAt, expressionPhaseAt, frameAtPhase, phaseAtFrame, frameBlendAt,
  PointerCycleTracker, nearestCycleValue, approachFrame, expressionKeyAt } from '../template3/hero/src/expression-field.js';
const point = (turn, radius = 1) => { const a = turn * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * radius, Math.sin(a) * radius]; };

test('successive pointer orbits advance successive cycles without rewinding at the seam', () => {
  const tracker = new PointerCycleTracker(); let frame = tracker.targetAt(...point(0), 12), initial = frame, seams = 0;
  for (let i = 1; i <= 720; i++) {
    const next = tracker.targetAt(...point(i / 360), frame);
    assert.ok(next >= frame - 1e-8); assert.ok(next - frame < 2);
    if (Math.floor(next / 240) !== Math.floor(frame / 240)) seams++;
    frame = next;
  }
  assert.equal(seams, 2); assert.ok(Math.abs(frame - initial - 480) < 1e-8);
});
test('counterclockwise motion reverses immediately and wraps backward across the same seam', () => {
  const tracker = new PointerCycleTracker(); let frame = tracker.targetAt(...point(0), 12), initial = frame;
  for (let i = 1; i <= 720; i++) {
    const next = tracker.targetAt(...point(-i / 360), frame);
    assert.ok(next <= frame + 1e-8); assert.ok(frame - next < 2); frame = next;
  }
  assert.ok(Math.abs(frame - initial + 480) < 1e-8);
  assert.ok(tracker.targetAt(...point(-2 + 1 / 360), frame) > frame);
});
test('the five expressions occupy equal portions of every orbit and radial movement still changes a frame', () => {
  for (const radius of [.3, 1, 3]) {
    const counts = {};
    for (let i = 0; i < 7200; i++) {
      const key = expressionKeyAt(expressionFrameAt(...point((i + .5) / 7200, radius)));
      counts[key] = (counts[key] || 0) + 1;
    }
    assert.equal(Object.keys(counts).length, 5);
    for (const count of Object.values(counts)) assert.ok(Math.abs(count - 1440) <= 1);
  }
  assert.notEqual(expressionFrameAt(...point(.12, .8)), expressionFrameAt(...point(.12, .81)));
});
test('the angular singularity holds the target, and lifecycle reset chooses the nearest cycle', () => {
  const tracker = new PointerCycleTracker(); let frame = tracker.targetAt(...point(.1), 12);
  assert.equal(tracker.targetAt(0, 0, frame), null); assert.equal(tracker.targetAt(NaN, 0, frame), null);
  tracker.reset(); frame = tracker.targetAt(...point(0), 235);
  assert.ok(frame > 240 && frame < 260);
  assert.equal(expressionPhaseAt(0, 0), null); assert.equal(expressionFrameAt(0, 0), 12);
});
test('phase and source-frame mappings invert for positive and negative laps', () => {
  for (const phase of [-3.01, -1, -.001, 0, .2, .4, .6, .8, .9999, 1, 2.999]) {
    assert.ok(Math.abs(phaseAtFrame(frameAtPhase(phase)) - phase) < 1e-10);
  }
  assert.equal(nearestCycleValue(12, 230, 240), 252);
  assert.ok(Math.abs(nearestCycleValue(225.6, 10, 240) + 14.4) < 1e-8);
});
test('the atlas restarts at the seam without reversing or holding a double-face crossfade', () => {
  assert.deepEqual(frameBlendAt(239.75, 240), { a: 239, b: 239, mix: 0 });
  assert.deepEqual(frameBlendAt(-.25, 240), { a: 239, b: 239, mix: 0 });
  assert.deepEqual(frameBlendAt(240.25, 240), { a: 0, b: 1, mix: .25 });
  assert.deepEqual(frameBlendAt(240, 240), { a: 0, b: 1, mix: 0 });
});
test('rapid extra laps do not queue obsolete whole cycles behind the current pointer', () => {
  for (const direction of [1, -1]) {
    const tracker = new PointerCycleTracker(); tracker.targetAt(...point(0), 12);
    for (let i = 1; i <= 1800; i++) {
      const target = tracker.targetAt(...point(direction * i / 360), 12);
      assert.ok(Math.abs(target - 12) <= 240 + 1e-8);
      assert.ok((target - 12) * direction >= -1e-8);
    }
  }
});
test('smoothing retains its speed cap, immediate reversal, exact settle and reduced-motion behavior', () => {
  let frame = 235;
  for (let i = 0; i < 20; i++) { const next = approachFrame(frame, 252, 1 / 60, 180, false, 72); assert.ok(next >= frame && next - frame <= 1.200001); frame = next; }
  assert.ok(approachFrame(frame, 230, 1 / 60, 180, false, 72) < frame);
  for (let i = 0; i < 180; i++) frame = approachFrame(frame, 252, 1 / 60, 180, false, 72);
  assert.equal(frame, 252); assert.equal(approachFrame(235, 252, 1 / 60, 180, true, 72), 252);
  assert.equal(approachFrame(12, 170, 0), 12);
});
