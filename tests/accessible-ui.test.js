import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindAccessibleUI } from '../src/app/accessible-ui.js';
import { createMenu } from '../src/app/menu.js';
import { createWorld } from '../src/sim/world.js';
import { setLang, t } from '../src/i18n.js';
test('navegação HTML chama ações, traduz rótulos e fornece ajuda/resultados em texto', () => {
  const node = (dataset = {}, tagName = 'BUTTON') => ({ dataset, tagName, textContent: '', hidden: false, options: [], attributes: {}, listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; }, removeEventListener(k) { delete this.listeners[k]; }, setAttribute(k, v) { this.attributes[k] = v; } });
  const elements = { game: node(), 'game-status': node(), 'help-transcript': node(), 'result-transcript': node(), 'mode-select': node({ action: 'mode' }, 'SELECT'), 'audio-toggle': node({ action: 'mute' }), start: node({ action: 'start', i18n: 'ui.start' }) };
  elements['mode-select'].options = ['coop', 'singles', 'versus', 'demo'].map(value => ({ value }));
  const doc = { documentElement: {}, getElementById: id => elements[id], querySelectorAll: selector => Object.values(elements).filter(e => selector === '[data-action]' ? e.dataset.action : e.dataset.i18n) };
  let starts = 0; const ui = bindAccessibleUI(doc, { start: () => starts++, mode() {}, mute() {} });
  const state = { screen: 'help', paused: false, menu: createMenu(), world: createWorld() };
  setLang('en'); ui.update(state); assert.equal(doc.documentElement.lang, 'en'); assert.equal(elements.start.textContent, 'Start match');
  assert.equal(elements['help-transcript'].hidden, false); assert.ok(elements['help-transcript'].textContent.includes(t('help.serve.title')));
  let focused = false; elements.game.focus = () => { focused = true; };
  elements.start.listeners.click(); assert.equal(starts, 1); assert.equal(focused, true);
  state.screen = 'playing'; state.world.phase = 'matchover'; state.world.score.winner = 'a'; state.world.score.sets = [{ a: 6, b: 3 }]; state.world.setHistory.push(structuredClone(state.world.stats)); ui.update(state);
  assert.equal(elements['result-transcript'].hidden, false); assert.ok(elements['result-transcript'].textContent.includes(t('stats.total')));
  assert.ok(elements['result-transcript'].textContent.includes('6-3'));
  for(const screen of ['menu','help','settings','players','loading']) {
    state.screen=screen;state.paused=true;ui.update(state);
    assert.equal(elements['result-transcript'].hidden,true,screen);
    assert.equal(elements['game-status'].textContent,t('ui.screen.'+screen),screen);
  }
  state.world.phase='rally';state.world.score.games={a:5,b:4};state.screen='menu';ui.update(state);
  assert.equal(elements['game-status'].textContent,t('ui.screen.menu'));
  ui.dispose(); assert.deepEqual(elements.start.listeners, {}); setLang('pt');
});
