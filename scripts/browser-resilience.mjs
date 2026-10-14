import assert from 'node:assert/strict';
import { runBrowserSuite } from './lib/browser-harness.mjs';

await runBrowserSuite('resilience', {
  async mediaFailureAndRecovery({ open }) {
    let releaseLanding, landingSeen = false, logoRequests = 0;
    const gate = new Promise(resolve => { releaseLanding = resolve; });
    const game = await open({ setup: async page => {
      await page.addInitScript(() => {
        globalThis.drawEvidence = { images: [], fallbackTitle: 0 };
        const image = CanvasRenderingContext2D.prototype.drawImage, text = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.drawImage = function (...args) {
          const source = args[0]?.src; if (source && !drawEvidence.images.includes(source)) drawEvidence.images.push(source);
          return image.apply(this, args);
        };
        CanvasRenderingContext2D.prototype.fillText = function (...args) {
          if (args[0] === 'ACE TURBO') drawEvidence.fallbackTitle++; return text.apply(this, args);
        };
      });
      await page.route('**/assets/media/logo.png', route => ++logoRequests === 1 ? route.fulfill({ status: 404, body: 'intentional test failure' }) : route.continue());
      await page.route('**/assets/media/landing.png', async route => { landingSeen = true; await gate; await route.continue(); });
    } });
    try {
      await game.page.waitForFunction(async () => (await import('/src/media.js')).mediaStatus.logo === 'error', null, { polling: 50 });
      assert.equal(landingSeen, true);
      await game.step(.2);
      const fallback = await game.page.evaluate(async () => ({ ...(await import('/src/media.js')).mediaStatus, ...drawEvidence }));
      assert.equal(fallback.landing, 'loading'); assert.ok(fallback.fallbackTitle > 0);
      await game.press('Digit7'); await game.press('Enter');
      assert.equal(await game.page.evaluate(() => testClient.getState().screen), 'help', 'Menu remains usable while media is pending');
      releaseLanding();
      await game.page.waitForFunction(async () => (await import('/src/media.js')).mediaStatus.landing === 'ready', null, { polling: 50 });
      await game.page.evaluate(async () => {
        const media = await import('/src/media.js'); media.loadMedia({ keys: ['logo'], retry: true }); await media.mediaSettled({ keys: ['logo'] });
      });
      await game.press('Escape'); await game.step(.1);
      const recovered = await game.page.evaluate(async () => ({ diagnostics: (await import('/src/media.js')).mediaDiagnostics(), ...drawEvidence }));
      assert.equal(recovered.diagnostics.logo.state, 'ready'); assert.equal(recovered.diagnostics.logo.attempt, 2);
      assert.equal(logoRequests, 2);
      for (const file of ['landing.png', 'logo.png']) assert.ok(recovered.images.some(src => src.endsWith(file)), `${file} rendered after recovery`);
      await game.finish(); return { expectedFailure: 'logo HTTP 404, landing held pending', fallback, recovered };
    } finally { releaseLanding(); }
  },
  async nativeAudioLifecycle({ open }) {
    const game = await open({ controlled: false, setup: async page => {
      await page.addInitScript(() => {
        globalThis.audioEvidence = { contexts: [], starts: 0, active: 0, resumes: 0, closes: 0 };
        // Hold only the start melody's delayed notes until the mute action.
        // AudioContext/oscillators stay native; the timer gate removes CI timing races.
        const nativeSet = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
        const held = new Map(); globalThis.holdMelody = false;
        window.setTimeout = (fn, delay, ...args) => {
          if (!holdMelody || ![100, 200].includes(delay)) return nativeSet(fn, delay, ...args);
          const id = nativeSet(() => {}, 60000); held.set(id, () => fn(...args)); return id;
        };
        window.clearTimeout = id => { held.delete(id); return nativeClear(id); };
        globalThis.pendingMelody = () => held.size;
        const Native = window.AudioContext || window.webkitAudioContext;
        if (!Native) throw Error('Native Web Audio unavailable');
        class ObservedAudio extends Native {
          constructor(...args) {
            super(...args); audioEvidence.contexts.push(this);
            const oscillator = this.createOscillator.bind(this), resume = this.resume.bind(this), close = this.close.bind(this);
            this.resume = (...args) => { audioEvidence.resumes++; return resume(...args); };
            this.close = (...args) => { audioEvidence.closes++; return close(...args); };
            this.createOscillator = (...args) => {
              const voice = oscillator(...args), start = voice.start.bind(voice);
              voice.start = (...args) => { audioEvidence.starts++; audioEvidence.active++; return start(...args); };
              voice.addEventListener('ended', () => audioEvidence.active--); return voice;
            };
          }
        }
        window.AudioContext = ObservedAudio;
      });
    } });
    assert.equal(await game.page.evaluate(() => audioEvidence.contexts.length), 0, 'Boot must not create audio before interaction');
    await game.page.locator('summary').click(); await game.page.locator('[data-action="mute"]').click();
    await game.page.locator('[data-action="start"]').click(); await game.step(.05);
    assert.equal(await game.page.evaluate(() => audioEvidence.contexts.length), 0, 'Muted start must not create an audio context');
    await game.page.locator('summary').click(); await game.page.locator('[data-action="mute"]').click();
    await game.page.locator('[data-action="menu"]').click(); await game.press('Digit4');
    await game.page.waitForFunction(() => audioEvidence.starts > 0, null, { polling: 50 });
    await game.page.evaluate(async () => { await audioEvidence.contexts[0].suspend(); });
    await game.press('Digit3');
    await game.page.waitForFunction(() => audioEvidence.contexts[0].state === 'running', null, { polling: 50 });
    assert.ok(await game.page.evaluate(() => audioEvidence.resumes > 0));
    await game.page.evaluate(() => { holdMelody = true; });
    await game.press('Enter');
    const starts = await game.page.evaluate(() => audioEvidence.starts);
    assert.equal(await game.page.evaluate(() => pendingMelody()), 2, 'Two melody notes must still be pending before mute');
    await game.page.locator('summary').click(); await game.page.locator('[data-action="mute"]').click();
    assert.equal(await game.page.evaluate(() => pendingMelody()), 0, 'Mute must cancel both pending notes');
    await game.page.waitForTimeout(350);
    assert.equal(await game.page.evaluate(() => audioEvidence.starts), starts, 'Muted timers must not start new voices');
    await game.page.waitForFunction(() => audioEvidence.active === 0, null, { polling: 50 });
    await game.page.evaluate(() => testClient.dispose());
    await game.page.waitForFunction(() => audioEvidence.contexts.every(ctx => ctx.state === 'closed'), null, { polling: 50 });
    const evidence = await game.page.evaluate(() => ({ starts: audioEvidence.starts, active: audioEvidence.active,
      resumes: audioEvidence.resumes, closes: audioEvidence.closes, states: audioEvidence.contexts.map(ctx => ctx.state) }));
    assert.equal(evidence.closes, 1); assert.deepEqual(evidence.states, ['closed']);
    await game.finish(); return { ...evidence, limitation: 'Native APIs verified; output quality and device autoplay policy require human acceptance.' };
  },
});
