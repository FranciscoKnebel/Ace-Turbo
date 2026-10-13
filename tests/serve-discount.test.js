import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, pickServer } from '../src/sim/world.js';
test('serve charge discount ends as soon as the ball is in flight', () => {
  const cost = inFlight => {
    const w = createWorld({ mode: 'versus', seed: 1 }); const p = pickServer(w);
    w.serve.inFlight = inFlight; w.ball.dead = true; p.stamina = 70;
    w.inputs[p.id] = { swing: true, shot: 'flat' }; stepWorld(w, 1 / 120);
    return 70 - p.stamina;
  };
  const discounted = cost(false), ordinary = cost(true);
  assert.ok(discounted > 0); assert.ok(ordinary > discounted * 3);
});
