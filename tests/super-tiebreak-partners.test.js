import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld,pickServer } from '../src/sim/world.js';
import { MatchScore } from '../src/sim/score.js';
test('both doubles partners serve distinct two-point turns in one-set and deciding super tiebreaks',()=>{
 for(const initialServer of ['a','b'])for(const bestOf of [1,3,5]) {
  const w=createWorld({mode:'demo',seed:1});w.score=new MatchScore({initialServer,bestOf,superTiebreak:true});
  if(bestOf>1){
   w.score.setsWon={a:w.score.setsToWin-1,b:w.score.setsToWin-2};
   w.score.games={a:0,b:5};w.score.points={a:0,b:3};w.score.awardPoint('b');
  }
  assert.equal(w.score.tbSuper,true);
  const ids=[];
  for(let n=0;n<9;n++){ids.push(pickServer(w).id);w.score.awardPoint(n%2?'b':'a');}
  assert.equal(ids[1],ids[2]);assert.equal(ids[3],ids[4]);assert.equal(ids[5],ids[6]);
  assert.notEqual(ids[0],ids[3]);assert.notEqual(ids[1],ids[5]);
  assert.equal(new Set(ids).size,4);
 }
});
