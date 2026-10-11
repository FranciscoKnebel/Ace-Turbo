import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownsClaim } from '../src/sim/ai/claims.js';
import { trajectoryFor } from '../src/sim/ai/perception-cache.js';
import { createWorld } from '../src/sim/world.js';
test('arbitragem de duplas desempata por id e independe da ordem dos jogadores', () => {
  const w = createWorld({ mode: 'demo' }); const [a, b] = w.players;
  a.x = -1; b.x = 1; a.y = b.y = -5;
  const reference = { x: 0, y: -5 };
  assert.equal(ownsClaim(w, a, reference), true); assert.equal(ownsClaim(w, b, reference), false);
  w.players.reverse(); assert.equal(ownsClaim(w, a, reference), true);
});
test('parceiros reutilizam a previsão no tick; mutação da bola invalida o cache', () => {
  const w = createWorld({ mode: 'demo' }); w.ball.heldBy = null;
  const prediction = trajectoryFor(w, w.ball);
  assert.equal(trajectoryFor(w, w.ball), prediction);
  w.ball.vy += 1; assert.notEqual(trajectoryFor(w, w.ball), prediction);
});
