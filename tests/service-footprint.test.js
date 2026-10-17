import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInBox } from '../src/sim/math.js';
test('service lines use a circular ball footprint, including corners', () => {
 const b = { xMin: 0, xMax: 4, yMin: 0, yMax: 6 };
 assert.equal(pointInBox(4.05, 3, b), true);
 assert.equal(pointInBox(4.056, 3, b), false);
 assert.equal(pointInBox(4.05, 6.05, b), false);
 assert.equal(pointInBox(4.03, 6.03, b), true);
});
