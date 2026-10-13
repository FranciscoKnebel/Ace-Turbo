import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMatrix } from '../scripts/balance-matrix.mjs';
test('same-class mirrored cells do not claim a zero-width independent confidence interval', () => {
 const report=runMatrix({classId:'balanced',seeds:2,difficulties:['normal'],maxSeconds:.01,mode:'demo',bestOf:1,surface:'hard',weather:'night'});
 const interval=report.results['normal|balanced|balanced'].winRateInterval;
 assert.equal(interval.lower,null);assert.equal(interval.upper,null);assert.match(interval.reason,/same simulation/);
});
