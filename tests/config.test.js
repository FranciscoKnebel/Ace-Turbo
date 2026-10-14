import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { createMenu, cycleMenuSetting } from '../src/app/menu.js';
test('opções inválidas são normalizadas com metadados coerentes', () => {
  const w = createWorld({ mode: '?', difficulty: '?', seed: NaN, bestOf: -1, noAd: 'false', surface: '?', weather: '?' });
  assert.equal(w.mode, 'singles'); assert.equal(w.difficulty, 'normal'); assert.equal(w.seed, 1);
  assert.equal(w.score.bestOf, 3); assert.equal(w.score.noAd, false); assert.equal(w.surface, 'hard');
  assert.doesNotThrow(() => createWorld(null));
});
test('ciclo de configurações opera sem canvas e aceita deltas grandes', () => {
  const menu = createMenu(); cycleMenuSetting(menu, 'surface', -10);
  assert.ok(menu.surfaceIndex >= 0); assert.equal(cycleMenuSetting(menu, 'unknown', 1), false);
});
test('traços de classe não são compartilhados entre jogadores', () => {
  const w = createWorld({ mode: 'demo', players: { a1: { classId: 'balanced' }, a2: { classId: 'balanced' } } });
  w.players[0].traits.net = 99; assert.notEqual(w.players[1].traits.net, 99);
});
