import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('a missing class value fails immediately rather than starting a default matrix',()=>{
 for(const args of [['--class'],['--class',''],['--class','--seeds','1']]) {
  const r=spawnSync(process.execPath,['scripts/balance-matrix.mjs',...args],{encoding:'utf8',timeout:2000});
  assert.notEqual(r.status,0);assert.equal(r.error,undefined);assert.match(r.stderr,/Missing value: --class/);
  assert.doesNotMatch(r.stdout,/matriz de equilíbrio|completed|partidas/);
 }
});
