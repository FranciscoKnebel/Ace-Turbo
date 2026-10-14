import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeView, drawHelp, drawLoading, drawGameOver } from '../src/render.js';
import { createWorld } from '../src/sim/world.js';
import { setLang } from '../src/i18n.js';
function context(width, height) {
  const calls = []; const state = { font: '14px sans-serif', textAlign: 'left', calls,
    measureText(text) { return { width: String(text).length * (parseFloat(this.font.match(/\d+px/)?.[0]) || 14) * 0.52 }; },
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText(text, x, y, maxWidth) { const w = Math.min(this.measureText(text).width, maxWidth ?? Infinity); const h = parseFloat(this.font.match(/\d+px/)?.[0]) || 14; calls.push({ text, left: x - (this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' ? w : 0), right: x + (this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' ? 0 : w), top: y - h / 2, bottom: y + h / 2 }); },
  };
  return new Proxy(state, { get: (s, k) => k in s ? s[k] : () => {}, set: (s, k, v) => (s[k] = v, true) });
}
test('textos de ajuda, carregamento e resultado cabem nos três viewports em PT/EN', () => {
  for (const lang of ['pt', 'en']) for (const [width, height] of [[1280, 720], [640, 360], [390, 844]]) {
    setLang(lang); const view = computeView(width, height); const w = createWorld({ mode: 'demo', bestOf: 5 });
    w.score.winner = 'a'; w.setHistory = Array.from({ length: 5 }, () => structuredClone(w.stats));
    for (const screen of ['help', 'loading', 'over']) {
      const ctx = context(width, height);
      if (screen === 'help') { const pages = drawHelp(ctx, view); for (let i = 1; i < pages; i++) drawHelp(ctx, view, i); }
      if (screen === 'loading') drawLoading(ctx, view, w, { modeIndex: 3, bestOfIndex: 2, difficultyIndex: 1 });
      if (screen === 'over') for (let page = 0; page < 6; page++) drawGameOver(ctx, view, w, page);
      const outside = ctx.calls.filter(c => c.left < -1 || c.right > width + 1 || c.top < 0 || c.bottom > height);
      assert.deepEqual(outside, [], `${lang} ${screen} ${width}x${height}`);
    }
  }
  setLang('pt');
});
