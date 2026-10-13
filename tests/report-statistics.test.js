import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribution, seedClusterInterval } from '../scripts/lib/report-statistics.mjs';
import { parseArgs, runMatrix } from '../scripts/balance-matrix.mjs';
import { runMatch } from '../scripts/lib/match-runner.mjs';
test('distribuições preservam caudas e incerteza não duplica lados da mesma seed', () => {
  assert.deepEqual(distribution([]),{n:0,min:null,p10:null,median:null,p90:null,max:null,mean:null});
  assert.equal(distribution([1,2,10]).median,2);assert.equal(distribution([1,2,10]).p90,8.4);
  const record=(seed,swap,winner,completed=true)=>({options:{seed},swap,winner,completed});
  const one=[record(1,false,'a'),record(1,true,'a')];
  assert.equal(seedClusterInterval(one).clusters,1);assert.equal(seedClusterInterval(one).lower,null);
  const rs=[...one,record(2,false,'b'),record(2,true,'b'),record(3,false,'a',false),record(3,true,'b')];
  const interval=seedClusterInterval(rs);assert.equal(interval.clusters,2);assert.equal(interval.excludedClusters,1);assert.equal(interval.estimate,.5);assert.deepEqual(interval,seedClusterInterval(rs));
});
test('matriz reutiliza configurações repetidas, declara protocolo e suporta singles', () => {
  const cfg=parseArgs(['--seeds','1','--difficulties','normal','--max-seconds','.1']);
  const report=runMatrix(cfg);assert.equal(report.schemaVersion,2);assert.equal(report.records.length,128);assert.equal(report.protocol.uniqueSimulations,64);
  assert.ok(Object.values(report.results).every(r=>r.durationSeconds.n===0 && r.winRateInterval.lower===null));
  const singles=runMatrix(parseArgs(['--mode','singles','--best-of','3','--class','balanced','--seeds','1','--difficulties','normal','--max-seconds','.1']));
  assert.ok(singles.records.every(r=>r.options.mode==='singles' && r.options.bestOf===3));
  for(const flags of [['--mode','coop'],['--best-of','2']])assert.throws(()=>parseArgs(flags));
});
test('runner mede séries por ponto, incluindo hits zero, sem incorporar pausas', () => {
  const report=runMatch({options:{mode:'demo',seed:7,bestOf:1},maxSeconds:5400});
  assert.ok(report.completed);assert.equal(report.pointSeries.length,report.stats.points);
  assert.equal(report.pointSeries.reduce((s,p)=>s+p.hits,0),report.stats.hits);
  assert.equal(report.metrics.rallyHits.n,report.stats.points);
  assert.ok(report.pointSeries.every(p=>p.seconds>0));
  assert.ok(report.pointSeries.reduce((s,p)=>s+p.seconds,0)<report.simulatedSeconds);
});
