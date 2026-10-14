import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { transitionPhase, enterPointPause } from '../src/sim/systems/phases.js';
test('pausa é atômica e transições inválidas não alteram estado', () => {
  const w = createWorld(); enterPointPause(w, 2.2);
  assert.equal(w.phase, 'pointover'); assert.equal(w.phaseTimer, 2.2); assert.equal(w.serve.inFlight, false);
  assert.throws(() => transitionPhase(w, 'rally')); assert.equal(w.phase, 'pointover');
  transitionPhase(w, 'serve'); assert.equal(w.phase, 'serve');
});
test('fronteira de tick rejeita tempos inválidos antes de modificar a partida', () => {
  const w = createWorld();
  for (const dt of [NaN, Infinity, 0, -1, 0.1]) assert.throws(() => stepWorld(w, dt), RangeError);
  assert.equal(w.elapsed, 0);
});
