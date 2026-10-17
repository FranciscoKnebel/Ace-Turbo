import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('matrix rejects every invalid explicit difficulty before simulating',()=>{
 for(const value of ['nromal','normal,typo','','normal,','NORMAL']) {
  const r=spawnSync(process.execPath,['scripts/balance-matrix.mjs','--difficulties',value],{timeout:2000,encoding:'utf8'});
  assert.notEqual(r.status,0);assert.equal(r.error,undefined);assert.match(r.stderr,/Invalid difficulties/);
 }
 const missing=spawnSync(process.execPath,['scripts/balance-matrix.mjs','--difficulties'],{timeout:2000,encoding:'utf8'});
 assert.notEqual(missing.status,0);assert.equal(missing.error,undefined);
});
