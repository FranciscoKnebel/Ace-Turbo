import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMatch } from '../scripts/lib/match-runner.mjs';
import { awardPoint } from '../src/sim/world.js';
test('a winner decided on the final tick is completed during the terminal pause', () => {
 const r=runMatch({options:{mode:'demo',bestOf:1},dt:1/120,maxSeconds:1/120,inputDriver:w=>{
  w.score.games={a:5,b:0};w.score.points={a:3,b:0};awardPoint(w,'a','test');
 }});
 assert.equal(r.completed,true);assert.equal(r.timeout,false);assert.equal(r.winner,'a');
});
