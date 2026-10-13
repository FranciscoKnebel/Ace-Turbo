import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, stepWorld } from '../src/sim/world.js';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/simulation.json', import.meta.url)));
test('simulação preserva a referência determinística de três seeds', () => {
  for (const expected of fixtures) {
    const w = createWorld({ mode: 'demo', seed: expected.seed, bestOf: 1 });
    for (let i = 0; i < 2400; i++) stepWorld(w, 1 / 120);
    assert.deepEqual({ seed: expected.seed, phase: w.phase, score: JSON.parse(JSON.stringify(w.score)), stats: w.stats,
      players: w.players.map(p => ({ id: p.id, x: p.x, y: p.y, stamina: p.stamina })),
      ball: { x: w.ball.x, y: w.ball.y, z: w.ball.z } }, expected);
  }
});
