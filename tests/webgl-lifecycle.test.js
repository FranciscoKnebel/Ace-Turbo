import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '../src/app/browser.js';

function setup(t) {
  const names = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'location'];
  const saved = names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]);
  let client;
  t.after(() => { client?.dispose(); for (const [n, d] of saved) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n]; } });
  const listeners = new Map(), frames = new Map(), layers = [];
  let frameId = 0;
  const calls = [];
  const ctx = new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => k in o ? o[k] : (...args) => calls.push([k, ...args]), set: (o, k, v) => (o[k] = v, true) });
  const canvas = { style: {}, getContext: () => ctx };
  globalThis.location = { search: '' };
  globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
    removeEventListener(k, fn) { listeners.get(k)?.delete(fn); } };
  globalThis.document = { getElementById: () => canvas, createElement() {
    const layer = { style: {}, attrs: {}, removed: 0, setAttribute(k,v) { this.attrs[k] = v; }, remove() { this.removed++; } };
    layers.push(layer); return layer;
  }, body: { insertBefore() {} } };
  globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const scene = { destroyed: 0, renders: 0, sizes: [], render() { this.renders++; }, resize(...size) { this.sizes.push(size); }, destroy() { this.destroyed++; } };
  client = boot({ createScene: () => pending });
  const flush = async () => { await new Promise(done => setImmediate(done)); };
  const frame = () => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(performance.now() + 50); };
  const key = code => { for (const fn of listeners.get('keydown') ?? []) fn({ code, preventDefault() {}, target: canvas }); frame(); for (const fn of listeners.get('keyup') ?? []) fn({ code, preventDefault() {}, target: canvas }); frame(); };
  const start = () => { key('Digit4'); key('Enter'); key('Enter'); assert.equal(client.getState().screen, 'playing'); };
  return { client, scene, layers, resolve, reject, flush, frame, start, frames, calls, resize() { for (const fn of listeners.get('resize')) fn(); } };
}

test('WebGL inicializado após dispose é destruído e não deixa canvas', async t => {
  const h = setup(t);
  h.client.dispose();
  assert.ok(h.layers[0].removed);
  h.resolve(h.scene); await h.flush();
  assert.equal(h.scene.destroyed, 1); assert.equal(h.frames.size, 0);
  assert.equal(h.layers[0].attrs['aria-hidden'], 'true');
});

test('WebGL sincroniza viewport/DPR atual após inicialização assíncrona', async t => {
  const h = setup(t);
  Object.assign(window, { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 }); h.resize();
  h.resolve(h.scene); await h.flush();
  assert.deepEqual(h.scene.sizes, [[390, 780, 2]]);
  h.client.dispose(); assert.equal(h.scene.destroyed, 1);
});

test('falha de render ativa 2D no mesmo quadro e mantém RAF', async t => {
  const h = setup(t); h.resolve(h.scene); await h.flush(); h.start();
  h.scene.render = () => { throw Error('GPU lost'); };
  h.calls.length = 0;
  h.frame();
  assert.equal(h.scene.destroyed, 1); assert.ok(h.layers[0].removed);
  assert.ok(h.calls.some(([method]) => method === 'arc'), 'mundo 2D completo desenhado');
  assert.equal(h.frames.size, 1);
  h.frame(); assert.equal(h.scene.destroyed, 1);
});

test('falhas de init e resize removem a camada e preservam fallback', async t => {
  const h = setup(t); h.scene.resize = () => { throw Error('resize failed'); };
  h.resolve(h.scene); await h.flush();
  assert.equal(h.scene.destroyed, 1); assert.ok(h.layers[0].removed);
  h.start(); h.frame(); assert.equal(h.frames.size, 1);
});

test('import/init rejeitado remove a camada e preserva o loop', async t => {
  const h = setup(t); h.reject(Error('no WebGL')); await h.flush();
  assert.ok(h.layers[0].removed); h.start(); h.frame(); assert.equal(h.frames.size, 1);
});
