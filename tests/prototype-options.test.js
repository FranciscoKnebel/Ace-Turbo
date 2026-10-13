import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatchOptions } from '../src/sim/config.js';
import { createWorld } from '../src/sim/world.js';
test('prototype property names are normalized as invalid match options', () => {
 for (const value of ['toString','constructor','__proto__','hasOwnProperty']) {
  const o=normalizeMatchOptions({ mode:value,difficulty:value,surface:value,weather:value });
  assert.equal(o.mode,'singles');assert.equal(o.difficulty,'normal');assert.equal(o.surface,'hard');assert.equal(o.weather,'night');
  assert.doesNotThrow(()=>createWorld(o));
 }
});
