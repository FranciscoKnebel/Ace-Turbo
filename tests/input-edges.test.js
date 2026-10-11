import { keyboardHarness } from './helpers/keyboard.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pumpHumanInputs } from '../src/input.js';
import { createWorld } from '../src/sim/world.js';
import { presentMessage } from '../src/app/messages.js';
import { setLang } from '../src/i18n.js';
test('tap entre frames produz pressionar e soltar em ticks consecutivos', () => {
  const {listeners,keyboard:kb}=keyboardHarness();
  const w = createWorld();
  listeners.keydown({ code: 'KeyJ', preventDefault() {} }); listeners.keyup({ code: 'KeyJ' });
  kb.endFrame(); pumpHumanInputs(kb, w);
  assert.equal(w.inputs.a1.swing, true); assert.equal(w.inputs.a1.shot, 'topspin');
  pumpHumanInputs(kb, w); assert.equal(w.inputs.a1.swing, false);
  listeners.keydown({ code: 'Space', preventDefault() {} }); listeners.blur();
  assert.equal(kb.wasPressed('Space'), false); pumpHumanInputs(kb, w); assert.equal(w.inputs.a1.swing, false);
});
test('mensagem de domínio traduz no momento da apresentação', () => {
  const msg = { key: 'msg.matchWon', params: { team: 'a' } };
  setLang('pt'); const pt = presentMessage(msg); setLang('en'); const en = presentMessage(msg);
  assert.notEqual(pt, en); assert.equal(msg.params.team, 'a'); setLang('pt');
});
