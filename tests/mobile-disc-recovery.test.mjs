import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../template3/site/_astro/main.qdXy8l6N.js', import.meta.url), 'utf8');
const functions = source.match(/function se\(e\)\{[\s\S]*?\}function ce\(e\)\{[\s\S]*?\}(?=var le=)/)?.[0];
function fake(lost) {
  const result = { removed: 0, disposed: 0, forced: 0, debug: {}, getContext: () => ({ isContextLost: () => lost }),
    dispose() { this.disposed++; }, forceContextLoss() { this.forced++; } };
  result.domElement = { remove() { result.removed++; } }; return result;
}
function harness() {
  assert.ok(functions, 'Renderer lifecycle functions must remain inspectable');
  const context = vm.createContext({ k: [], A: new WeakMap(), window: { siteDebug: false } });
  vm.runInContext(`${functions};globalThis.api={acquire:se,recycle:ce};`, context); return context;
}
test('a lost pooled renderer is disposed and replaced, while healthy renderers are still reused', () => {
  const context = harness(), dead = fake(true), replacement = fake(false), healthy = fake(false);
  context.k.push(dead);
  assert.equal(context.api.acquire({ WebGLRenderer: function () { return replacement; } }), replacement);
  assert.equal(dead.disposed, 1);
  context.k.push(healthy);
  assert.equal(context.api.acquire({ WebGLRenderer: function () { throw Error('should reuse'); } }), healthy);
});
test('recycling a lost context frees its targets and never puts it back into the renderer pool', () => {
  const context = harness(), dead = fake(true); let disposedTarget = 0;
  context.A.set(dead, { target: { dispose() { disposedTarget++; } } });
  context.api.recycle(dead);
  assert.equal(context.k.length, 0); assert.equal(dead.removed, 1); assert.equal(dead.disposed, 1); assert.equal(disposedTarget, 1);
  const healthy = fake(false); context.api.recycle(healthy); assert.equal(context.k[0], healthy); assert.equal(healthy.disposed, 0);
});
