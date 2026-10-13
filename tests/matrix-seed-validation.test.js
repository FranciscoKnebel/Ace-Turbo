import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('matrix rejects non-finite, fractional and missing seed counts before simulating', () => {
 for(const value of ['Infinity','NaN','1.5','0','-1','']) {
  const r=spawnSync(process.execPath,['scripts/balance-matrix.mjs','--seeds',value],{timeout:2000,encoding:'utf8'});
  assert.notEqual(r.status,0);assert.equal(r.error,undefined);
 }
});
