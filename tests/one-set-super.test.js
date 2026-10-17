import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchScore } from '../src/sim/score.js';
test('best-of-one super tiebreak starts immediately and preserves the initial server', () => {
 for (const initialServer of ['a', 'b']) {
  const s = new MatchScore({ bestOf: 1, superTiebreak: true, initialServer });
  assert.equal(s.tiebreak, true); assert.equal(s.tbSuper, true); assert.equal(s.server, initialServer);
  for (let i=0;i<9;i++) s.awardPoint('a'); assert.equal(s.winner, null);
  s.awardPoint('a'); assert.equal(s.winner, 'a'); assert.deepEqual(s.sets[0].tiebreak, { a: 10, b: 0 });
 }
});
