import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld,stepWorld } from '../src/sim/world.js';
import { COURT } from '../src/sim/constants.js';
test('receivers blocked at either service line retain stamina and can move sideways or back', () => {
 for(const team of ['a','b']) for(const sprint of [false,true]) {
  const w=createWorld({mode:'versus',seed:2}),p=w.byId[team+'1'];
  const sign=team==='a'?-1:1;
  w.phase='rally';w.serve.inFlight=true;w.serve.receiverId=p.id;w.ball.dead=true;
  p.x=0;p.y=sign*COURT.SERVICE_LINE;p.vy=-sign*p.maxSpeed;p.vx=0;p.stamina=50;
  w.inputs[p.id]={up:sign<0,down:sign>0,sprint};stepWorld(w,1/120);
  assert.equal(p.vy,0);assert.equal(p.y,sign*COURT.SERVICE_LINE);assert.ok(p.stamina>=50);
  w.inputs[p.id]={right:true,sprint};stepWorld(w,1/120);assert.ok(p.x>0);
  w.inputs[p.id]={up:sign>0,down:sign<0};stepWorld(w,1/120);assert.ok(sign*p.y>COURT.SERVICE_LINE);
 }
});
