import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, stepWorld } from '../src/sim/world.js';
function compareState(actual, expected, path = 'state') {
  if (typeof expected === 'number') {
    if (Number.isInteger(expected)) assert.equal(actual, expected, path);
    else assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${path}: ${actual} != ${expected}`);
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), path);
    for (const key of Object.keys(expected)) compareState(actual[key], expected[key], `${path}.${key}`);
  } else assert.equal(actual, expected, path);
}
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/simulation.json', import.meta.url)));
test('simulação preserva a referência determinística de três seeds', () => {
  for (const expected of fixtures) {
    const w = createWorld({ mode: 'demo', seed: expected.seed, bestOf: 1 });
    for (let i = 0; i < 2400; i++) stepWorld(w, 1 / 120);
    compareState({ seed: expected.seed, phase: w.phase, score: JSON.parse(JSON.stringify(w.score)), stats: w.stats,
      players: w.players.map(p => ({ id: p.id, x: p.x, y: p.y, stamina: p.stamina })),
      ball: { x: w.ball.x, y: w.ball.y, z: w.ball.z } }, expected);
  }
});
