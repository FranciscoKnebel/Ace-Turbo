import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchScore } from '../src/sim/score.js';
import { formatSetScore } from '../src/score-format.js';
const game=(s,t)=>{for(let n=0;n<4;n++)s.awardPoint(t);};
test('ordinary tiebreak enters with the next team and an extended finish rotates into the super tiebreak',()=>{
 for(const initialServer of ['a','b']) {
  const s=new MatchScore({initialServer,bestOf:3,superTiebreak:true});
  for(let n=0;n<6;n++)game(s,'a');
  const opener=s.server;
  for(let n=0;n<6;n++){game(s,'a');game(s,'b');}
  assert.equal(s.tbFirstServer,opener);assert.equal(s.server,opener);
  for(let n=0;n<6;n++){s.awardPoint('a');s.awardPoint('b');}
  s.awardPoint('b');s.awardPoint('b');
  assert.equal(s.tbSuper,true);assert.equal(s.tbFirstServer,s.other(opener));
 }
});
test('super tiebreak results display points while ordinary tiebreak results display games',()=>{
 for(const winner of ['a','b']) {
  const s=new MatchScore({bestOf:1,superTiebreak:true});
  for(let n=0;n<8;n++){s.awardPoint('a');s.awardPoint('b');}
  s.awardPoint(winner);s.awardPoint(winner);
  assert.equal(formatSetScore(s.sets[0]),winner==='a'?'10-8':'8-10');
 }
 assert.equal(formatSetScore({a:7,b:6,tiebreak:{a:10,b:8}}),'7-6');
});
