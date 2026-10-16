import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.js';
import { browserType, engine, runtime } from './lib/browser-engine.mjs';
const directory = new URL(`../browser-artifacts/${engine}/`, import.meta.url);
await mkdir(directory, { recursive: true });
const root = fileURLToPath(new URL('../', import.meta.url));
const roots = { candidate: root, ...(process.env.BASELINE_ROOT ? { baseline: process.env.BASELINE_ROOT } : {}) };
const report = { schemaVersion: 1, protocol: 'native-frame-v1', engine, runtime, seed: 21,
  settings: { viewport: [1280, 720], dpr: 1, warmupMs: 1000, sampleMs: 3000, repetitions: 3, sessionMs: 60000 },
  limitations: ['Headless CI JS callback cost and RAF intervals; excludes GPU/compositor cost and is not a physical-device FPS guarantee.', 'Heap is supplementary when exposed; this protocol does not prove absence of all memory leaks.', '25%/1ms review flag is informational; machine noise is not a CI gate.'], samples: [], session: [] };
const servers = [], browser = await browserType.launch({ headless: true });
report.runtime = { ...runtime, browser: browser.version() };
function summary(values) {
  assert.ok(values.length > 0, 'No native application frames observed');
  const sorted = [...values].sort((a, b) => a - b), at = p => sorted[Math.ceil(p * sorted.length) - 1];
  return { samples: sorted.length, median: at(.5), p95: at(.95), max: sorted.at(-1) };
}
async function open(label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'pt-BR' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Date.now = () => 20; // Only seed provenance; performance and RAF stay native.
    const raf = requestAnimationFrame, names = new Set(['keydown', 'keyup', 'blur', 'resize']), listeners = new Map();
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
    window.addEventListener = (name, fn, options) => { if (names.has(name)) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); } return add(name, fn, options); };
    window.removeEventListener = (name, fn, options) => { listeners.get(name)?.delete(fn); return remove(name, fn, options); };
    globalThis.nativeMeasurement = { samples: [], last: null, recording: false, total: 0,
      reset() { this.samples = []; this.last = null; this.recording = true; },
      snapshot() { return { samples: this.samples, total: this.total, heap: performance.memory?.usedJSHeapSize ?? null,
        listeners: Object.fromEntries([...listeners].map(([name, entries]) => [name, entries.size])) }; } };
    requestAnimationFrame = callback => raf.call(window, callback.name !== 'frame' ? callback : now => {
      const start = performance.now(); callback(now); nativeMeasurement.total++;
      if (nativeMeasurement.recording) {
        if (nativeMeasurement.samples.length >= 20000) throw Error('Native measurement trace limit exceeded');
        nativeMeasurement.samples.push({ duration: performance.now() - start, interval: nativeMeasurement.last === null ? null : now - nativeMeasurement.last });
        nativeMeasurement.last = now;
      }
    });
  });
  await page.goto(roots[label].url);
  await page.evaluate(async () => { const { boot } = await import('/src/app/browser.js'); globalThis.testClient = boot(); });
  return { page, errors };
}
async function start(page) {
  await page.keyboard.press('Digit4');
  await page.waitForFunction(() => testClient.getState().menu.modeIndex === 3);
  await page.keyboard.press('Enter'); await page.waitForFunction(() => testClient.getState().screen === 'loading');
  await page.keyboard.press('Enter'); await page.waitForFunction(() => testClient.getState().screen === 'playing');
}
async function measure(page, milliseconds) {
  await page.evaluate(() => nativeMeasurement.reset()); await page.waitForTimeout(milliseconds);
  const snapshot = await page.evaluate(() => { nativeMeasurement.recording = false; return nativeMeasurement.snapshot(); });
  return { callbackMs: summary(snapshot.samples.map(s => s.duration)), frameIntervalMs: summary(snapshot.samples.map(s => s.interval).filter(n => n !== null)),
    heapBytes: snapshot.heap, listeners: snapshot.listeners, totalFrames: snapshot.total };
}
async function dispose(page, errors) {
  await page.evaluate(() => testClient.dispose());
  const before = await page.evaluate(() => nativeMeasurement.snapshot()); await page.waitForTimeout(100);
  const after = await page.evaluate(() => nativeMeasurement.snapshot());
  assert.equal(before.total, after.total); assert.ok(Object.values(after.listeners).every(n => n === 0)); assert.deepEqual(errors, []);
  await page.close(); return { framesAfterDispose: after.total - before.total, listeners: after.listeners };
}
try {
  for (const [label, path] of Object.entries(roots)) {
    const server = createStaticServer({ root: path }); servers.push(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    roots[label] = { path, url: `http://127.0.0.1:${server.address().port}`, revision: execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  }
  report.revisions = Object.fromEntries(Object.entries(roots).map(([label, value]) => [label, value.revision]));
  // Alternate ordering within pairs to reduce a consistent cold/warm bias.
  for (let repetition = 0; repetition < 3; repetition++) for (const label of (repetition % 2 ? Object.keys(roots).reverse() : Object.keys(roots))) {
    const { page, errors } = await open(label);
    await page.waitForTimeout(1000); const menu = await measure(page, 3000);
    await start(page); await page.waitForTimeout(1000); const playing = await measure(page, 3000);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/assets/')).map(r => ({ path: new URL(r.name).pathname, durationMs: r.duration, transferBytes: r.transferSize, encodedBytes: r.encodedBodySize })));
    const disposed = await dispose(page, errors);
    report.samples.push({ label, repetition, menu, playing, resources, disposed });
  }
  const { page, errors } = await open('candidate'); await start(page);
  for (let checkpoint = 1; checkpoint <= 4; checkpoint++) {
    const measurement = await measure(page, 15000);
    const state = await page.evaluate(async () => {
      const { assertMatchInvariants } = await import('/src/sim/systems/phases.js');
      const w = testClient.getState().world; assertMatchInvariants(w);
      return { elapsed: w.elapsed, phase: w.phase, points: w.stats.points, seed: w.seed };
    });
    report.session.push({ wallSeconds: checkpoint * 15, ...measurement, state });
  }
  const counts = report.session[0].listeners;
  assert.ok(report.session.every(s => JSON.stringify(s.listeners) === JSON.stringify(counts)));
  assert.ok(report.session.at(-1).state.elapsed > report.session[0].state.elapsed);
  report.sessionDispose = await dispose(page, errors);
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  report.comparison = ['menu', 'playing'].map(state => {
    const candidate = median(report.samples.filter(s => s.label === 'candidate').map(s => s[state].callbackMs.p95));
    const base = report.samples.filter(s => s.label === 'baseline');
    const baseline = base.length ? median(base.map(s => s[state].callbackMs.p95)) : null;
    return { state, candidateP95MedianMs: candidate, baselineP95MedianMs: baseline,
      needsHumanPerformanceReview: baseline !== null && candidate > baseline * 1.25 && candidate - baseline > 1 };
  });
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.stack; throw error; }
finally {
  await writeFile(new URL('qualification-performance.json', directory), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
console.log(`${engine}: native performance protocol and 60-second session passed`);
