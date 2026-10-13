import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('matrix rejects misspelled options and positional arguments without starting any match',()=>{
 for(const args of [['--clas','speedster'],['speedster'],['--difficulty','normal'],['--seeds','1','extra']]) {
  const r=spawnSync(process.execPath,['scripts/balance-matrix.mjs',...args],{timeout:2000,encoding:'utf8'});
  assert.notEqual(r.status,0);assert.equal(r.error,undefined);assert.match(r.stderr,/Unknown option|Unknown.*argument/);
  assert.doesNotMatch(r.stdout,/partidas|matches/);
 }
});
