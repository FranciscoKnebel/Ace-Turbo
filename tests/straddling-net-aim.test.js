import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { chooseAimX } from '../src/sim/ai.js';
test('two net opponents on opposite wings expose the center rather than a fixed occupied wing',()=>{
 const w=createWorld({mode:'demo',seed:1}),p=w.byId.a1;
 p.stamina=p.staminaMax;
 for(const xs of [[-2.2,2.2],[-3,1],[1,-3]]) {
  [w.byId.b1.x,w.byId.b2.x]=xs;w.byId.b1.y=w.byId.b2.y=3;
  let calls=0;w.rng=()=>{calls++;return .99;};
  assert.equal(chooseAimX(w,p),0);assert.equal(calls,1);
  w.players.reverse();assert.equal(chooseAimX(w,p),0);
 }
 w.byId.b1.x=-2.2;w.byId.b2.y=10;assert.equal(chooseAimX(w,p),1);
});
