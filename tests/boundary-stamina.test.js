import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld,stepWorld } from '../src/sim/world.js';
import { COURT } from '../src/sim/constants.js';
test('outward input at a court boundary stops velocity and permits regeneration', () => {
 for(const sprint of [false,true]) {
  const w=createWorld({mode:'versus',seed:2}),p=w.byId.a1;
  w.phase='rally';w.serve.inFlight=false;w.ball.dead=true;
  p.x=COURT.DOUBLES_HALF_WIDTH+1.8;p.vx=p.maxSpeed;p.stamina=50;
  w.inputs.a1={right:true,sprint};stepWorld(w,1/120);
  assert.equal(p.vx,0);assert.ok(p.stamina>50);assert.equal(p.x,COURT.DOUBLES_HALF_WIDTH+1.8);
  w.inputs.a1={left:true};stepWorld(w,1/120);assert.ok(p.x<COURT.DOUBLES_HALF_WIDTH+1.8);
 }
});
