import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageCache } from '../src/assets/image-cache.js';
import { createAudio } from '../src/audio.js';
import { boot } from '../src/app/browser.js';
test('cache de imagens deduplica, sinaliza falhas e permite retry', async () => {
  const instances = [];
  class Image { constructor() { instances.push(this); } decode() { return Promise.reject(new Error('decode optional')); } }
  const cache = createImageCache({ a: 'a.png' }, { getImageType: () => Image });
  cache.load(); cache.load(); assert.equal(instances.length, 1);
  instances[0].onerror(); await cache.whenSettled(); assert.equal(cache.status.a, 'error');
  cache.load({ retry: true }); assert.equal(instances.length, 2);
  Object.assign(instances[1], { complete: true, naturalWidth: 20 }); instances[1].onload();
  await cache.whenSettled(); assert.equal(cache.status.a, 'ready');
});
test('boot e dispose repetidos removem somente seus listeners e frames', t => {
  const names = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]);
  t.after(() => { for (const [n, d] of saved) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n]; } });
  const listeners = new Map(), frames = new Map(); let frameId = 0;
  const ctx = new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => k in o ? o[k] : () => {}, set: (o, k, v) => (o[k] = v, true) });
  const canvas = { style: {}, getContext: () => ctx };
  globalThis.window = { innerWidth: 640, innerHeight: 360, addEventListener(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); }, removeEventListener(k, fn) { listeners.get(k)?.delete(fn); } };
  globalThis.document = { getElementById: () => canvas };
  globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const a = boot(), b = boot(); const stale = [...frames.values()][0];
  assert.equal(listeners.get('keydown').size, 2); a.dispose(); a.dispose(); stale(performance.now());
  assert.equal(listeners.get('keydown').size, 1); assert.equal(frames.size, 1);
  b.dispose(); assert.equal(frames.size, 0); assert.ok([...listeners.values()].every(set => set.size === 0));
});
test('áudio isola contextos, trata resume rejeitado e fecha ao descartar', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window'); const contexts = [];
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
  class Context {
    constructor() { contexts.push(this); this.state = 'suspended'; this.currentTime = 0; this.closed = 0; }
    resume() { return Promise.reject(new Error('autoplay blocked')); }
    close() { this.closed++; return Promise.resolve(); }
    createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  globalThis.window = { AudioContext: Context };
  const a = createAudio(), b = createAudio(); a.start(); b.hit(); assert.equal(contexts.length, 2);
  a.setMuted(true); a.dispose(); a.dispose(); b.dispose(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(contexts.map(c => c.closed), [1, 1]); a.hit(); assert.equal(contexts.length, 2);
});
