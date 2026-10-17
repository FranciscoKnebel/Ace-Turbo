import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchScore } from '../src/sim/score.js';
test('an extended ordinary tiebreak gives the deciding super tiebreak to the opposite opener', () => {
 for(const opener of ['a','b']) {
  const s=new MatchScore({bestOf:3,superTiebreak:true});s.setsWon={a:1,b:0};s.games={a:6,b:6};
  s.tiebreak=true;s.tbFirstServer=opener;s.server=s.other(opener);s.tbPoints={a:6,b:7};
  s.awardPoint('b');assert.equal(s.tbSuper,true);assert.equal(s.tbFirstServer,s.other(opener));
 }
});
