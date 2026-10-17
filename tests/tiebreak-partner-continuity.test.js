import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { MatchScore } from '../src/sim/score.js';
const game=(s,t)=>{for(let n=0;n<4;n++)s.awardPoint(t);};
const partner=s=>(s.teamServeIndex[s.server]+(s.tiebreak?s.tbServeBlocks[s.server]:0))%2;
test('doubles tiebreak opener consumes a service turn before normal games resume',()=>{
 for(const initialServer of ['a','b'])for(const extended of [false,true]) {
  const s=new MatchScore({initialServer,bestOf:3});
  for(let n=0;n<6;n++){game(s,'a');game(s,'b');}
  const opener=s.server,openerPartner=partner(s);
  assert.equal(opener,initialServer);
  for(let n=0;n<(extended?6:5);n++){s.awardPoint('a');s.awardPoint('b');}
  s.awardPoint('a');s.awardPoint('a');
  assert.equal(s.server,s.other(opener));
  game(s,'b');assert.equal(s.server,opener);assert.equal(partner(s),1-openerPartner);
 }
});
