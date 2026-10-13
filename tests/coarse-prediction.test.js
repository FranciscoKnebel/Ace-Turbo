import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBall,predictTrajectory } from '../src/sim/physics.js';
test('coarse forecast requests still stop at two individually timed bounces', () => {
 const b={...makeBall(),x:1,y:4,z:3,heldBy:null};
 const coarse=predictTrajectory(b,{dt:5,maxT:5}),fine=predictTrajectory(b,{dt:1/120,maxT:5});
 assert.equal(coarse.bounces.length,2);assert.ok(coarse.bounces[0].t<coarse.bounces[1].t);assert.deepEqual(coarse,fine);
});
