import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, changeEnds, pickServer, processBounce } from '../src/sim/world.js';
import { teamAt } from '../src/sim/court-sides.js';
test('trocas de lado preservam identidade, histórico aninhado e sacador de tiebreak', () => {
  const w = createWorld({ mode: 'versus' });
  w.score.awardPoint('a'); w.score.awardPoint('b'); w.score.awardPoint('a');
  w.score.tiebreak = true; w.score.tbPoints = { a: 4, b: 2 }; w.score.tbFirstServer = 'a'; w.score.tbServeBlocks = { a: 3, b: 2 };
  const before = structuredClone(w.score); const server = pickServer(w).id;
  changeEnds(w);
  assert.deepEqual(w.score, Object.assign(Object.create(Object.getPrototypeOf(w.score)), before));
  assert.equal(w.byId.a1.team, 'a'); assert.equal(w.byId.a1.side, 'b'); assert.equal(pickServer(w).id, server);
  assert.equal(teamAt(w, 5), 'a'); changeEnds(w); assert.equal(w.byId.a1.side, 'a'); assert.deepEqual(w.score.history, before.history);
});
test('arbitragem após troca atribui o ponto ao time lógico correto', () => {
  const w = createWorld({ mode: 'versus' }); changeEnds(w); w.phase = 'rally'; w.serve.inFlight = false;
  w.ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  w.ball.bounces = [{ x: 0, y: 3, inCourt: true }];
  processBounce(w, w.ball.bounces[0]);
  assert.equal(w.lastPoint.team, 'b'); assert.equal(w.lastPoint.reason, 'outOfArea');
});
