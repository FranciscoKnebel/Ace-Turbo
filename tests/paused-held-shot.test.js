import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard, pumpHumanInputs } from '../src/input.js';
import { createWorld, stepWorld, pickServer } from '../src/sim/world.js';
test('discarding paused transitions preserves a held charge without releasing a toss', () => {
 const listeners={}, k=createKeyboard({addEventListener:(n,f)=>listeners[n]=f});
 const w=createWorld({mode:'versus',seed:1}), p=pickServer(w), code=p.id==='a1'?'Space':'Enter';
 listeners.keydown({code,preventDefault(){}});pumpHumanInputs(k,w);stepWorld(w,1/120);
 assert.equal(p.charging,true);k.clearTransitions();
 listeners.keydown({code,repeat:true,preventDefault(){}});pumpHumanInputs(k,w);stepWorld(w,1/120);
 assert.equal(p.charging,true);assert.equal(w.serve.toss,null);
 listeners.keyup({code});pumpHumanInputs(k,w);stepWorld(w,1/120);assert.ok(w.serve.toss);k.dispose();
});
