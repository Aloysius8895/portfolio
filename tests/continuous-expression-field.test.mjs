import test from 'node:test';
import assert from 'node:assert/strict';
import { expressionFrameAt, createBalancedExpressionField, approachFrame, expressionKeyAt } from '../template3/hero/src/expression-field.js';

test('nearby pointer positions inside the same expression continue to change fractional source frames', () => {
  const frames = Array.from({ length: 20 }, (_, index) => expressionFrameAt(-.68 - index * .005, .03));
  assert.equal(new Set(frames).size, 20);
  assert.ok(frames.some(frame => frame % 1 !== 0));
  assert.equal(new Set(frames.map(frame => expressionKeyAt(frame))).size, 1);
});
test('both pointer axes contribute to a continuous bounded field without categorical region seams', () => {
  const frames = [];
  for (let x = -1; x <= 1; x += .05) for (let y = -1; y <= 1; y += .05) {
    const frame = expressionFrameAt(x, y);
    assert.ok(frame >= 0 && frame <= 239);
    assert.ok(Math.abs(frame - expressionFrameAt(x + .0001, y)) < .1);
    assert.ok(Math.abs(frame - expressionFrameAt(x, y + .0001)) < .1);
    frames.push(frame.toFixed(3));
  }
  assert.ok(new Set(frames).size > 1000);
});
test('default and distant directional positions correspond to the original source expression examples', () => {
  assert.equal(expressionFrameAt(0, 0), 12);
  assert.ok(Math.abs(expressionFrameAt(-10, 0) - 60) < .001);
  assert.ok(Math.abs(expressionFrameAt(10, 0) - 160.8) < .001);
  assert.ok(Math.abs(expressionFrameAt(0, 10) - 108) < .001);
  assert.ok(Math.abs(expressionFrameAt(0, -10) - 225.6) < .001);
  assert.equal(expressionFrameAt(NaN, 0), 12);
});
test('new targets affect the very next frame and reversals do not wait for a previous action', () => {
  const first = approachFrame(12, 170, 1 / 60);
  assert.ok(first > 12 && first < 170);
  const reversed = approachFrame(first, 0, 1 / 60);
  assert.ok(reversed < first && reversed > 0);
});
test('smoothing is independent of rendering frequency and settles exactly without perpetual activity', () => {
  let fast = 12, slow = 12;
  for (let i = 0; i < 12; i++) fast = approachFrame(fast, 170, 1 / 60);
  for (let i = 0; i < 6; i++) slow = approachFrame(slow, 170, 1 / 30);
  assert.ok(Math.abs(fast - slow) < 1e-8);
  for (let i = 0; i < 90; i++) fast = approachFrame(fast, 170, 1 / 60);
  assert.equal(fast, 170);
  assert.equal(approachFrame(12, 170, 1 / 60, 55, true), 170);
});

test('all five expressions cover equal pointer area on independent desktop and tall viewport grids', () => {
  for (const [width, height] of [[4, 2], [2, 4]]) {
    const samples = [];
    for (let row = 0; row < 60; row++) for (let column = 0; column < 80; column++) {
      samples.push({ x: -1 + width * (column + .5) / 80, y: -1 + height * (row + .5) / 60 });
    }
    const field = createBalancedExpressionField(samples), counts = {};
    for (let row = 0; row < 73; row++) for (let column = 0; column < 97; column++) {
      const x = -1 + width * (column + .5) / 97, y = -1 + height * (row + .5) / 73;
      const frame = field(x, y), key = expressionKeyAt(frame);
      counts[key] = (counts[key] || 0) + 1;
      assert.ok(Number.isFinite(frame) && frame >= 0 && frame <= 239);
      assert.ok(Math.abs(frame - field(x + 1e-7, y)) < .01, 'continuous horizontal rank interpolation');
      assert.ok(Math.abs(frame - field(x, y + 1e-7)) < .01, 'continuous vertical rank interpolation');
    }
    assert.equal(Object.keys(counts).length, 5);
    for (const count of Object.values(counts)) assert.ok(Math.abs(count / (73 * 97) - .2) < .015, JSON.stringify(counts));
  }
});
