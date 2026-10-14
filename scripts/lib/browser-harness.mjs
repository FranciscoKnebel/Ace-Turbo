import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createStaticServer } from '../serve.js';

// Only the test scheduler is accelerated. Production controller, input, physics,
// Canvas and DOM run unchanged; this is not a wall-clock performance benchmark.
export function installFrameDriver() {
  let now = 1000, id = 0;
  const frames = new Map();
  Date.now = () => 20; // Client resolves seed 21; independent of CI date.
  Object.defineProperty(performance, 'now', { value: () => now });
  requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  cancelAnimationFrame = token => frames.delete(token);
  globalThis.browserTest = {
    events: [], frames: 0,
    step(seconds, frameMs = 50) {
      const end = now + seconds * 1000;
      while (now < end - 1e-7) {
        now = Math.min(end, now + frameMs);
        const callbacks = [...frames.values()]; frames.clear();
        for (const callback of callbacks) callback(now);
        this.frames++;
      }
    },
    observe() {
      const world = testClient.getState().world;
      if (!world || world.events.observed) return;
      Object.defineProperty(world.events, 'observed', { value: true });
      const push = world.events.push;
      world.events.push = function (...events) {
        for (const event of events) {
          if (browserTest.events.length >= 20000) throw Error('Event trace limit exceeded');
          browserTest.events.push({ elapsed: world.elapsed, ...structuredClone(event) });
        }
        return push.apply(this, events);
      };
    },
    pendingFrames: () => frames.size,
  };
}

export async function runBrowserSuite(name, cases) {
  const { chromium } = await import('playwright');
  const directory = new URL('../../browser-artifacts/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const server = createStaticServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const report = { schemaVersion: 1, suite: name, engine: 'chromium', cases: [], limitations: ['Headless CI does not validate physical keyboard, audible output or screen-reader interpretation.'] };
  const pages = [];
  async function open({ controlled = true, locale = 'pt-BR', viewport = { width: 1280, height: 720 }, deviceScaleFactor = 1, setup } = {}) {
    // Axe opens a diagnostic page in the same context; an explicitly owned
    // context supports that and remains isolated from every other test case.
    const context = await browser.newContext({ viewport, locale, deviceScaleFactor });
    const page = await context.newPage(); pages.push(page);
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    if (controlled) await page.addInitScript(installFrameDriver);
    await setup?.(page);
    // Slow media must not prevent testing the rendered fallback.
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { const { boot } = await import('/src/app/browser.js'); globalThis.testClient = boot(); });
    const step = seconds => controlled
      ? page.evaluate(seconds => browserTest.step(seconds), seconds)
      : page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const press = async key => { await page.keyboard.press(key); await step(.05); };
    const start = async mode => {
      await press('Digit' + ({ coop: 1, singles: 2, versus: 3, demo: 4 })[mode]); await press('Enter');
      assert.equal(await page.evaluate(() => testClient.getState().screen), 'loading');
      if (controlled) await page.evaluate(() => browserTest.observe());
      await press('Enter');
      assert.equal(await page.evaluate(() => testClient.getState().screen), 'playing');
    };
    const finish = async () => {
      await page.evaluate(() => testClient.dispose()); assert.deepEqual(errors, []); await context.close();
    };
    return { page, step, press, start, finish, errors, base, directory };
  }
  try {
    for (const [caseName, run] of Object.entries(cases)) {
      try { report.cases.push({ name: caseName, passed: true, evidence: await run({ open }) }); }
      catch (error) { report.cases.push({ name: caseName, passed: false, error: error.stack }); throw error; }
    }
  } finally {
    await writeFile(new URL(`qualification-${name}.json`, directory), JSON.stringify(report, null, 2) + '\n');
    for (const page of pages) if (!page.isClosed()) await page.close();
    await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  console.log(`${name}: ${report.cases.length} browser cases passed`);
}
