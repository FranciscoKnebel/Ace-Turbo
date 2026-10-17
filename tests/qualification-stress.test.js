import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarios, executeScenario } from '../scripts/qualification-stress.mjs';

test('protocolo de stress cobre cada eixo e extremos customizados sem repetir seeds', () => {
  const cases = scenarios(); assert.equal(cases.length, 40);
  assert.equal(new Set(cases.map(c => c.options.seed)).size, 40);
  for (const [key, values] of Object.entries({ mode: ['coop', 'demo', 'singles', 'versus'], difficulty: ['easy', 'hard', 'impossible', 'normal', 'unfair'], surface: ['clay', 'grass', 'hard'], weather: ['day', 'night', 'random', 'windy'], bestOf: [1, 3, 5], noAd: [false, true], superTiebreak: [false, true] })) {
    assert.deepEqual([...new Set(cases.map(c => c.options[key]))].sort(), values);
  }
  assert.ok(cases.some(c => c.options.players.a1.classId === 'custom' && c.options.players.b1.stats.power === 99));
  for (const count of [0, -1, 201, 1.5, NaN]) assert.throws(() => scenarios(count), RangeError);
});

test('timeout de stress preserva configuração e trace reproduzíveis, sem fabricar vitória', () => {
  const config = { ...scenarios(1)[0], maxSeconds: .01 };
  const first = executeScenario(config), replay = executeScenario(JSON.parse(JSON.stringify(config)));
  assert.equal(first.passed, false); assert.match(first.error.message, /timed out/);
  assert.deepEqual(first.config, config); assert.ok(first.trace.length > 0);
  assert.deepEqual(replay.trace, first.trace); assert.equal(replay.error.message, first.error.message);
  assert.equal(first.match, undefined);
});
