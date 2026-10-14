import { keyboardHarness } from './helpers/keyboard.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/app/controller.js';
import { createMenu, settingRow } from '../src/app/menu.js';
import { SETTING_SCHEMA, cycleMenuSetting, readSetting, matchOptionsFor, settingsSnapshot } from '../src/app/settings.js';
import { pumpHumanInputs } from '../src/input.js';
import { setLang, t } from '../src/i18n.js';
test('controlador sem DOM/Canvas executa comandos, loading, pausa, telas e descarte', () => {
  assert.equal(typeof window,'undefined'); assert.equal(typeof document,'undefined');
  const app=createController({now:()=>7});
  app.actions.mode('singles'); app.actions.start();
  assert.equal(app.getState().world.mode,'singles'); assert.equal(app.getState().world.seed,8);
  for(let i=0;i<101;i++)app.advance(.05);
  assert.equal(app.getState().screen,'playing'); const elapsed=app.getState().world.elapsed;
  app.actions.pause();app.advance(.05);assert.equal(app.getState().world.elapsed,elapsed);
  app.actions.pause();app.advance(.05);assert.ok(app.getState().world.elapsed>elapsed);
  app.actions.blur();assert.equal(app.getState().paused,true);
  for(const screen of ['help','players','settings','menu']){app.actions[screen]();assert.equal(app.getState().screen,screen);}
  app.dispose();const before=app.getState().world.elapsed;app.advance(.05);assert.equal(app.getState().world.elapsed,before);
});
test('um descriptor gera defaults, cycling, rótulos e opções resolvidas em PT/EN', () => {
  const menu=createMenu({language:'pt'});
  for(const [kind,def] of Object.entries(SETTING_SCHEMA)) {
    assert.equal(readSetting(menu,kind),def.default);
    for(const value of def.values) {
      const state={...menu,[def.property]:def.direct?value:def.values.indexOf(value)};
      assert.equal(settingsSnapshot(state)[kind],value);
      for(const lang of ['pt','en']) {setLang(lang);const row=settingRow(kind,state);assert.notEqual(row.label,def.label);assert.equal(row.sub,t(def.labels?.[value]??def.prefix+value));}
    }
    cycleMenuSetting(menu,kind,def.values.length);assert.equal(readSetting(menu,kind),def.default);
  }
  cycleMenuSetting(menu,'bestOf',1);cycleMenuSetting(menu,'scoring',1);
  assert.equal(matchOptionsFor(menu,3).bestOf,3);assert.equal(matchOptionsFor(menu,3).noAd,true);setLang('pt');
});
test('mesma fila de ações gera comandos por tick iguais em frames de 30/60/144 Hz', () => {
  const sequences=[];
  for(const fps of [30,60,144]) {
    const {listeners,keyboard:kb}=keyboardHarness(),commands=[];
    const app=createController({keyboard:kb,readInputs:(keys,w)=>{pumpHumanInputs(keys,w);commands.push(structuredClone(w.inputs.a1));},now:()=>7});
    app.actions.start();listeners.keydown({code:'Enter',preventDefault(){}});app.advance(0);kb.endFrame();
    for(const code of ['Space','KeyJ','KeyK']){listeners.keydown({code,preventDefault(){}});listeners.keyup({code});}
    while(commands.length<12){app.advance(1/fps);kb.endFrame();}
    sequences.push(commands.slice(0,12));app.dispose();
  }
  assert.deepEqual(sequences[0],sequences[1]);assert.deepEqual(sequences[0],sequences[2]);
  assert.deepEqual(sequences[0].slice(0,6).map(c=>c.swing),[true,false,true,false,true,false]);
});

test('horizontal mode navigation starts from the focused row', () => {
  const { listeners, keyboard: kb } = keyboardHarness();
  const app = createController({ keyboard: kb });
  const press = code => { listeners.keydown({ code, preventDefault() {} }); app.advance(0); kb.endFrame(); listeners.keyup({ code }); };
  press('ArrowDown'); press('ArrowDown'); press('ArrowRight');
  assert.equal(app.getState().menu.focus, 3); assert.equal(app.getState().menu.modeIndex, 3); app.dispose();
});
test('paused shot events never replay after keyboard resume', () => {
  const { listeners, keyboard: kb } = keyboardHarness();
  const app = createController({ keyboard: kb, readInputs: pumpHumanInputs, now: () => 7 });
  const press = code => { listeners.keydown({ code, preventDefault() {} }); app.advance(0); kb.endFrame(); listeners.keyup({ code }); };
  app.actions.mode('coop'); app.actions.start(); press('Enter'); app.advance(.05);
  press('KeyP'); assert.equal(app.getState().paused, true);
  for (const code of ['KeyJ', 'KeyK', 'Comma', 'Period']) press(code);
  press('KeyP');
  for (let i = 0; i < 12; i++) { app.advance(1 / 120); assert.equal(app.getState().world.inputs.a1.swing, false); assert.equal(app.getState().world.inputs.a2.swing, false); }
  app.dispose();
});

test('controller pause preserves held charging; blur cancels it without a shot', () => {
 const listeners={}, kb=createKeyboard({addEventListener:(n,f)=>listeners[n]=f});
 const app=createController({keyboard:kb,readInputs:pumpHumanInputs,now:()=>7});
 app.actions.mode('versus');app.actions.start();
 // Finish loading with normal frames.
 for(let i=0;i<101;i++)app.advance(.05);
 const w=app.getState().world, p=w.byId[w.serve.serverId], code=p.id==='a1'?'Space':'Enter';
 listeners.keydown({code,preventDefault(){}});app.advance(1/120);kb.endFrame();assert.equal(p.charging,true);
 app.actions.pause();app.actions.pause();app.advance(1/120);kb.endFrame();assert.equal(p.charging,true);assert.equal(w.serve.toss,null);
 app.actions.blur();assert.equal(p.charging,false);app.actions.pause();app.advance(1/120);assert.equal(w.serve.toss,null);
 app.getState().fx.summaryPage=3;app.actions.start();assert.equal(app.getState().fx.summaryPage,0);app.dispose();
});
