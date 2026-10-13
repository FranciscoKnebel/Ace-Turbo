import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, startServeToss, executeServe, registerFault, processBounce, awardPoint, resetForServe } from '../src/sim/world.js';
import { assertMatchInvariants } from '../src/sim/systems/phases.js';
import { makeStats, METRICS, reduceStats } from '../src/sim/systems/telemetry.js';
import { MatchScore } from '../src/sim/score.js';
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`);
function sumCheck(w) {
  const parts=[...w.setHistory,w.setStats];
  for (const [key,value] of Object.entries(w.stats)) {
    if (typeof value === 'number') near(value,parts.reduce((n,s)=>n+s[key],0));
    else for (const sub of Object.keys(value)) near(value[sub],parts.reduce((n,s)=>n+(s[key][sub]??0),0));
  }
  assert.equal(w.stats.points,w.score.history.length);
}
test('invariantes cobrem toss, voo, devolução, fault, let e dupla falta', () => {
  const w=createWorld({mode:'singles',bestOf:1}); const p=w.byId.a1;
  assert.equal(assertMatchInvariants(w),'serve.prepare');
  startServeToss(w,p,.75,'flat'); assert.equal(assertMatchInvariants(w),'serve.toss');
  executeServe(w,p,.75); assert.equal(assertMatchInvariants(w),'serve.flight');
  const box=w.serve.box; const bounce={x:(box.xMin+box.xMax)/2,y:(box.yMin+box.yMax)/2};
  processBounce(w,bounce); assert.equal(assertMatchInvariants(w),'rally.return');
  resetForServe(w); startServeToss(w,p,.75,'flat'); executeServe(w,p,.75);
  w.ball.touchedNet=true; processBounce(w,bounce); assert.equal(assertMatchInvariants(w),'serve.prepare'); assert.equal(w.serve.attempt,1);
  registerFault(w); assert.equal(assertMatchInvariants(w),'serve.prepare'); assert.equal(w.serve.attempt,2);
  registerFault(w); assert.equal(assertMatchInvariants(w),'pointover'); sumCheck(w);
  w.serve.inFlight=true; assert.throws(()=>assertMatchInvariants(w),/pause\/end flags/);
});
test('cada ponto conta uma vez; totais são soma dos sets e invariantes chegam ao fim', () => {
  const w=createWorld({mode:'demo',bestOf:3,noAd:true,superTiebreak:true});
  for (const team of ['a','b','a']) {
    const priorSets=w.score.sets.length;
    while(w.score.sets.length===priorSets && !w.score.winner) {
      if(w.phase!=='serve') resetForServe(w);
      const before=w.stats.points; awardPoint(w,team,'doubleBounce'); awardPoint(w,team,'doubleBounce');
      assert.equal(w.stats.points,before+1); assertMatchInvariants(w); sumCheck(w);
    }
  }
  stepWorld(w,4/100); for(let n=0;n<200 && w.phase!=='matchover';n++) stepWorld(w,.05);
  assert.equal(assertMatchInvariants(w),'matchover'); sumCheck(w);
});
test('redutor tem semântica explícita de toss, contato e tentativas; formatos inválidos normalizam', () => {
  assert.deepEqual(Object.keys(METRICS).sort(),Object.keys(makeStats()).sort());
  const s=makeStats(); reduceStats(s,{type:'toss',quality:.8}); reduceStats(s,{type:'serveContact',qualityDelta:-.2});
  reduceStats(s,{type:'serve',attempt:1,shot:'flat'}); reduceStats(s,{type:'toss',quality:.4}); reduceStats(s,{type:'fault'});
  near(s.tossQualitySum,1); assert.equal(s.tosses,2); assert.equal(s.serves,1); assert.equal(s.faults,1);
  for(const bestOf of [0,2,4,NaN,Infinity]) assert.equal(new MatchScore({bestOf}).bestOf,3);
});
