import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, LANG_ORDER, detectLang, getLang, setLang, t } from '../src/i18n.js';
import { pt } from '../src/lang/pt.js';
import { en } from '../src/lang/en.js';

test('padrão é português e o dicionário responde', () => {
  setLang('pt');
  assert.equal(getLang(), 'pt');
  assert.equal(t('menu.difficulty'), 'Dificuldade');
  assert.equal(t('difficulty.impossible'), 'Impossível');
  assert.equal(detectLang(), 'pt'); // Node, sem window
});

test('troca para inglês e volta', () => {
  try {
    setLang('en');
    assert.equal(t('menu.difficulty'), 'Difficulty');
    assert.equal(t('mode.coop.label'), 'Co-op Doubles');
    assert.equal(t('help.title'), 'HOW TO PLAY');
    assert.equal(t('msg.gameWon', { team: 'YOU' }), 'GAME YOU!');
    assert.equal(t('situation.meio-voleio'), 'HALF-VOLLEY');
  } finally {
    setLang('pt');
  }
});

test('chave desconhecida volta a própria chave e parâmetros são substituídos', () => {
  assert.equal(t('nao.existe'), 'nao.existe');
  assert.equal(t('hud.bestOf', { n: 3 }), 'MELHOR DE 3');
  assert.equal(t('hud.tiebreak', { a: 7, b: 5 }), 'TIEBREAK 7-5');
  assert.equal(t('over.sets', { sets: '6-4  6-3' }), 'Sets: 6-4  6-3');
});

test('português e inglês têm exatamente as mesmas chaves', () => {
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
  assert.deepEqual(LANG_ORDER, ['pt', 'en']);
  assert.ok(LANGS.en && LANGS.pt);
});

test('idioma inválido é ignorado', () => {
  setLang('pt');
  assert.equal(setLang('xx'), 'pt');
  assert.equal(getLang(), 'pt');
});
