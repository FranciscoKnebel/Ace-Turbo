import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, pickServer } from '../src/sim/world.js';
import { stepAI } from '../src/sim/ai.js';
test('a failed serve-volley roll clears a previous attempt with the same serve id', () => {
  const w = createWorld({ mode: 'demo', seed: 1 }), p = pickServer(w), ai = p.ai;
  ai.serveId = w.serve.id; ai.lastServeId = w.serve.id; ai.serveWait = 0;
  p.traits = { ...p.traits, net: 1 }; ai.approach = 1; w.rng = () => .99;
  w.serve.toss = { idealZ: 2.4 }; w.serve.stage = 'hit'; w.ball.z = 1; w.ball.vz = -1;
  stepAI(w, p, 1 / 120); assert.equal(ai.approach, 0);
});
