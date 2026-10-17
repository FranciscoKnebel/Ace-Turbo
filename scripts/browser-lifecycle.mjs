import assert from 'node:assert/strict';
import { runBrowserSuite } from './lib/browser-harness.mjs';

await runBrowserSuite('lifecycle', {
  async heldKeysAndBlur({ open }) {
    const game = await open(); await game.page.bringToFront(); await game.start('coop');
    await game.page.keyboard.down('Space'); await game.page.keyboard.down('ArrowLeft'); await game.step(.2);
    const before = await game.page.evaluate(() => {
      const w = testClient.getState().world; return { elapsed: w.elapsed, charging: w.byId.a1.charging, moving: w.inputs.a2.left };
    });
    assert.equal(before.charging, true); assert.equal(before.moving, true);
    // Exercise the DOM blur adapter deterministically; OS/tab behavior remains
    // a hardware acceptance check, not a claim of native window deactivation.
    await game.page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await game.page.evaluate(() => testClient.getState().paused), true);
    const canceled = await game.page.evaluate(() => {
      const s = testClient.getState();
      return { charging: s.world.byId.a1.charging, events: browserTest.events.filter(e => e.player === 'a1').length };
    });
    assert.equal(canceled.charging, false, 'Blur must cancel the active charge');
    await game.step(1);
    assert.equal(await game.page.evaluate(() => testClient.getState().world.elapsed), before.elapsed);
    await game.press('KeyP');
    const after = await game.page.evaluate(() => {
      const s = testClient.getState();
      return { paused: s.paused, input1: s.world.inputs.a1, input2: s.world.inputs.a2,
        charging: s.world.byId.a1.charging, events: browserTest.events.filter(e => e.player === 'a1').length };
    });
    assert.equal(after.paused, false); assert.equal(after.input1.swing, false); assert.equal(after.input2.left, false);
    assert.equal(after.charging, false, 'Resume must not restart the canceled charge');
    assert.equal(after.events, canceled.events, 'Resume must not release the canceled charge');
    await game.page.keyboard.up('Space'); await game.page.keyboard.up('ArrowLeft');
    await game.finish(); return { mechanism: 'DOM blur event with real held Playwright keys', before, after };
  },
  async resizeAndDpr({ open }) {
    const evidence = [];
    for (const dpr of [1, 2]) {
      const game = await open({ deviceScaleFactor: dpr }); await game.start('demo');
      for (const [width, height] of [[1280, 720], [640, 360], [390, 844], [1280, 720]]) {
        await game.page.setViewportSize({ width, height });
        // Native resize delivery is asynchronous, independent of the test RAF.
        await game.page.waitForFunction(({ width, height, dpr }) => {
          const canvas = document.getElementById('game');
          return canvas.width === width * dpr && canvas.height === height * dpr;
        }, { width, height, dpr }, { polling: 50 });
        await game.step(.1);
        const actual = await game.page.evaluate(() => {
          const canvas = document.getElementById('game'), m = canvas.getContext('2d').getTransform();
          return { width: canvas.width, height: canvas.height, cssWidth: canvas.getBoundingClientRect().width,
            cssHeight: canvas.getBoundingClientRect().height, scale: m.a, screen: testClient.getState().screen, phase: testClient.getState().world.phase };
        });
        assert.equal(actual.width, width * dpr); assert.equal(actual.height, height * dpr);
        assert.equal(actual.cssWidth, width); assert.equal(actual.cssHeight, height); assert.equal(actual.scale, dpr);
        assert.equal(actual.screen, 'playing');
        evidence.push({ requested: { width, height, dpr }, actual });
      }
      await game.finish();
    }
    return { checks: evidence, limitation: 'DPR/viewport emulation; OS/browser zoom controls require human acceptance.' };
  },
  async repeatedMountAndRestart({ open }) {
    const game = await open({ setup: async page => {
      await page.addInitScript(() => {
        const names = new Set(['keydown', 'keyup', 'blur', 'resize']), listeners = new Map();
        const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
        window.addEventListener = (name, listener, options) => {
          if (names.has(name)) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); }
          return add(name, listener, options);
        };
        window.removeEventListener = (name, listener, options) => { listeners.get(name)?.delete(listener); return remove(name, listener, options); };
        globalThis.listenerCounts = () => Object.fromEntries([...listeners].map(([name, entries]) => [name, entries.size]));
      });
    } });
    const baseline = await game.page.evaluate(() => listenerCounts());
    assert.deepEqual(baseline, { keydown: 1, keyup: 1, blur: 2, resize: 1 });
    const cycles = [];
    for (let n = 0; n < 20; n++) {
      const repeated = await game.page.evaluate(async () => { const { boot } = await import('/src/app/browser.js'); return boot() === testClient; });
      assert.equal(repeated, true); assert.deepEqual(await game.page.evaluate(() => listenerCounts()), baseline);
      assert.equal(await game.page.evaluate(() => browserTest.pendingFrames()), 1);
      await game.start('demo'); await game.step(.2);
      await game.page.evaluate(() => { globalThis.previousWorld = testClient.getState().world; });
      await game.press('KeyR');
      assert.equal(await game.page.evaluate(() => testClient.getState().screen), 'loading');
      assert.equal(await game.page.evaluate(() => testClient.getState().world !== previousWorld), true);
      await game.press('Enter'); await game.press('KeyM');
      assert.equal(await game.page.evaluate(() => testClient.getState().screen), 'menu');
      await game.page.evaluate(() => testClient.dispose());
      assert.equal(await game.page.evaluate(() => browserTest.pendingFrames()), 0, 'Dispose must cancel RAF before the queue is advanced');
      await game.step(.2);
      const disposed = await game.page.evaluate(() => ({ listeners: listenerCounts(), frames: browserTest.pendingFrames() }));
      assert.equal(disposed.frames, 0); assert.ok(Object.values(disposed.listeners).every(count => count === 0)); cycles.push(disposed);
      if (n < 19) await game.page.evaluate(async () => { const { boot } = await import('/src/app/browser.js'); testClient = boot(); });
    }
    await game.finish(); return { cycles: cycles.length, baseline, final: cycles.at(-1) };
  },
});
