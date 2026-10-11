import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, runMatrix } from '../scripts/balance-matrix.mjs';
import { runMatch, breakPointTeam } from '../scripts/lib/match-runner.mjs';
import { MatchScore } from '../src/sim/score.js';
test('runner é reproduzível e distingue timeout de derrota', () => {
  const config = { options: { mode: 'demo', seed: 9 }, maxSeconds: 1 };
  const a = runMatch(config); assert.deepEqual(a, runMatch(config));
  assert.equal(a.timeout, true); assert.equal(a.completed, false); assert.equal(a.winner, null);
  assert.throws(() => runMatch({ dt: NaN }), RangeError);
  assert.throws(() => runMatch({ options: { mode: 'versus' } }), /inputDriver/);
});
test('break points consideram deuce no-ad e excluem tiebreak', () => {
  const score = new MatchScore(); score.points = { a: 3, b: 3 };
  assert.equal(breakPointTeam(score), null); score.noAd = true; assert.equal(breakPointTeam(score), 'b');
  score.tiebreak = true; assert.equal(breakPointTeam(score), null);
});
test('CLI rejeita valores ausentes, fracionários e dificuldades inválidas', () => {
  for (const argv of [['--seeds'], ['--seeds', '1.5'], ['--difficulties', 'invalid'], ['--wat'], ['--max-seconds', 'NaN'], ['--class', 'invalid']]) assert.throws(() => parseArgs(argv));
  const config = parseArgs(['--seeds', '1', '--difficulties', 'normal', '--class', 'balanced', '--max-seconds', '0.1']);
  const report = runMatrix(config); assert.equal(report.records.length, 16);
  assert.ok(Object.values(report.results).every(row => row.completed === 0 && row.winsA === 0 && row.timeouts === 2));
});

test('runner detecta estado numérico inválido com seed e tick', () => {
  assert.throws(() => runMatch({ options: { mode: 'singles', seed: 42 }, maxSeconds: 2,
    inputDriver: w => { w.players[0].vx = NaN; } }), /seed 42, tick 120/);
});
