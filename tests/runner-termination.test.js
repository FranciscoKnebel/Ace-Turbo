import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMatch } from '../scripts/lib/match-runner.mjs';
test('runner rejects invalid state in a final partial interval', () => {
  for (const maxSeconds of [2, 7]) assert.throws(() => runMatch({ dt: .05, maxSeconds,
    options: { mode: 'singles' }, inputDriver: (w, tick) => { if (tick === Math.ceil(maxSeconds / .05) - 1) w.players[0].vx = NaN; } }), /Invalid simulation state/);
});
