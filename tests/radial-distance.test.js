import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtOutDistance, boxOutDistance } from '../src/sim/geometry.js';
import { COURT, PHYS } from '../src/sim/constants.js';
test('judgment distances subtract the ball radius once after measuring a corner', () => {
 const expected = Math.hypot(.3,.3) - PHYS.BALL_RADIUS;
 assert.ok(Math.abs(courtOutDistance(COURT.SINGLES_HALF_WIDTH+.3,COURT.HALF_LENGTH+.3,false)-expected)<1e-12);
 assert.ok(Math.abs(boxOutDistance(4.3,6.3,{xMin:0,xMax:4,yMin:0,yMax:6})-expected)<1e-12);
});
