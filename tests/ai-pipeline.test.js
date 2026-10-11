import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownsClaim } from '../src/sim/ai/claims.js';
import { trajectoryFor } from '../src/sim/ai/perception-cache.js';
import { createWorld } from '../src/sim/world.js';
test('arbitragem de duplas desempata por id e independe da ordem dos jogadores', () => {
  const w = createWorld({ mode: 'demo' }); const [a, b] = w.players;
  a.x = -1; b.x = 1; a.y = b.y = -5;
  const reference = { x: 0, y: -5 };
  assert.equal(ownsClaim(w, a, reference), true); assert.equal(ownsClaim(w, b, reference), false);
  w.players.reverse(); assert.equal(ownsClaim(w, a, reference), true);
});
test('parceiros reutilizam a previsão no tick; mutação da bola invalida o cache', () => {
  const w = createWorld({ mode: 'demo' }); w.ball.heldBy = null;
  const prediction = trajectoryFor(w, w.ball);
  assert.equal(trajectoryFor(w, w.ball), prediction);
  w.ball.vy += 1; assert.notEqual(trajectoryFor(w, w.ball), prediction);
});

test('diagnósticos explicam bola fora e não mudam a simulação ou seu RNG', async () => {
  const { observeDecisions,decisionTrace }=await import('../src/sim/ai/diagnostics.js');
  const { planIntercept }=await import('../src/sim/ai/planner.js');
  const w=createWorld({mode:'demo',seed:4});w.phase='rally';w.serve.returnPending=false;
  Object.assign(w.ball,{x:10,y:2,z:1,vy:4,vz:0,heldBy:null,lastHit:{team:'a',player:'a1',isServe:false}});
  const p=w.byId.b1,stop=observeDecisions(w);
  assert.equal(planIntercept(w,p,w.ball).reason,'outJudgment');
  const trace=decisionTrace(w);assert.equal(trace[0].reason,'outJudgment');assert.ok(trace[0].outDistance>trace[0].margin);
  stop();assert.deepEqual(decisionTrace(w),[]);
  const { stepWorld }=await import('../src/sim/world.js');
  const a=createWorld({mode:'demo',seed:7}),b=createWorld({mode:'demo',seed:7});observeDecisions(a);
  for(let i=0;i<2400;i++){stepWorld(a,1/120);stepWorld(b,1/120);}
  assert.deepEqual(a.stats,b.stats);assert.deepEqual(a.score,b.score);assert.deepEqual(a.ball,b.ball);assert.equal(a.rng(),b.rng());
});

test('claims são exclusivos e desistência de carga tem razão observável', async () => {
  const {claimOwner}=await import('../src/sim/ai/claims.js');
  const {observeDecisions,decisionTrace}=await import('../src/sim/ai/diagnostics.js');
  const {stepAI}=await import('../src/sim/ai.js');
  const w=createWorld({mode:'demo',seed:7}),a=w.byId.a1,b=w.byId.a2;
  for(let i=0;i<100;i++) {
    a.x=i/20-2;b.x=-a.x;a.y=-3-i/50;b.y=-8+i/60;
    const ref={x:i/30-1,y:-6};
    assert.equal([a,b].filter(p=>ownsClaim(w,p,ref)).length,1);
    assert.equal(claimOwner(w,'a',ref),claimOwner(w,'a',ref));
  }
  w.phase='rally';w.serve.returnPending=false;w.serve.inFlight=false;
  Object.assign(w.ball,{x:0,y:5,z:5,heldBy:null,lastHit:{team:'a',player:'a1',isServe:false},bounces:[]});
  const p=w.byId.b1;Object.assign(p.ai,{lastServeId:w.serve.id,lastHitKey:'a1:0',reactTimer:2,decideTimer:2,holding:true,holdT:2,holdTarget:.5});
  observeDecisions(w);stepAI(w,p,1/120);
  assert.ok(decisionTrace(w).some(e=>e.reason==='chargeExpired'));
});
