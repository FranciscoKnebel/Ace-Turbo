import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { drawCompactGameOver, STAT_ROWS } from '../src/view/statistics.js';
import { drawCompactLoading } from '../src/view/screens.js';
function context() {
  const texts = [], panels = []; let first = false, start;
  const c = { texts, panels, fillText: (text, x, y) => texts.push({ text, x, y }), beginPath: () => { first = true; }, moveTo: (x, y) => { start = { x, y }; }, arcTo: (x1, y1, x2, y2, r) => { if (first) panels.push({ x: start.x - r, y: start.y, w: x1 - start.x + r, h: y2 - start.y }); first = false; } };
  return new Proxy(c, { get: (o, k) => k in o ? o[k] : () => {} });
}
test('compact results reserve space for every row and footer in short landscape', () => {
  for (const width of [479, 568]) {
    const w = createWorld({ mode: 'demo', seed: 3 }), c = context(); w.score.winner = 'a';
    drawCompactGameOver(c, { width, height: 320, cx: width / 2 }, w, 0);
    const rows = c.texts.slice(3, 3 + STAT_ROWS.length * 2);
    assert.equal(rows.length, STAT_ROWS.length * 2);
    assert.ok(rows.every(p => p.y >= 100 && p.y < 260));
    assert.ok(c.texts.every(p => p.y >= 0 && p.y < 320));
    assert.ok(c.texts.slice(3 + STAT_ROWS.length * 2, -1).every(p => p.y + 7 < 277), 'Shot/reason lines must fit above the footer');
  }
});
test('all four loading cards fit above the progress bar at 479 by 320', () => {
  const c = context(), w = createWorld({ mode: 'demo', seed: 3 });
  drawCompactLoading(c, { width: 479, height: 320, cx: 479 / 2 }, w, {}, .5);
  assert.equal(c.panels.length, 4);
  assert.ok(c.panels.every(p => p.y >= 128 && p.y + p.h <= 284));
});
