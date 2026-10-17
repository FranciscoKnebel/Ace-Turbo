import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { planIntercept } from '../src/sim/ai.js';
test('reachable early doubles volley belongs to the net player regardless of player order', () => {
 const w=createWorld({mode:'demo',seed:2}),a=w.byId.a1,b=w.byId.a2;
 w.phase='rally';w.serve.returnPending=false;w.serve.inFlight=false;
 a.x=b.x=0;a.y=-4;b.y=-10;
 Object.assign(w.ball,{x:0,y:1,z:1.8,vx:0,vy:-9,vz:2,heldBy:null,dead:false,bounces:[],lastHit:{player:'b1',team:'b',isServe:false}});
 for(const reverse of [false,true]) {
  if(reverse)w.players.reverse();
  const first=planIntercept(w,a,w.ball),second=planIntercept(w,b,w.ball);
  assert.ok(first.intercept);assert.equal(second.intercept,null);assert.ok(first.intercept.t<1);
 }
});
