import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ICON_SOURCES,
  actionIcon,
  actionIconName,
  drawIcon,
  handVariant,
  icon,
  iconReady,
  loadIcons,
} from '../src/icons.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('forehand usa +, backhand usa - e neutro usa o ícone normal', () => {
  assert.equal(handVariant('forehand'), 'plus');
  assert.equal(handVariant('backhand'), 'minus');
  assert.equal(handVariant('neutral'), null);
  assert.equal(handVariant(undefined), null);
  assert.equal(actionIconName('shot-topspin', 'forehand'), 'shot-topspin-plus');
  assert.equal(actionIconName('shot-topspin', 'backhand'), 'shot-topspin-minus');
  assert.equal(actionIconName('shot-topspin', 'neutral'), 'shot-topspin');
  assert.equal(actionIconName('serve-flat', 'neutral'), 'serve-flat');
});

test('todo ícone declarado existe em assets/icons/vectors', () => {
  for (const [name, src] of Object.entries(ICON_SOURCES)) {
    assert.ok(existsSync(join(ROOT, src)), `ícone ${name} não encontrado em ${src}`);
  }
  for (const action of ['shot-flat', 'shot-topspin', 'shot-slice', 'shot-lob']) {
    assert.ok(ICON_SOURCES[`${action}-plus`], `${action} deveria ter variante +`);
    assert.ok(ICON_SOURCES[`${action}-minus`], `${action} deveria ter variante -`);
  }
  for (const action of ['serve-flat', 'serve-kick', 'serve-slice', 'serve-lob', 'turbo']) {
    assert.ok(ICON_SOURCES[`${action}-plus`], `${action} deveria ter variante +`);
    assert.ok(ICON_SOURCES[`${action}-minus`], `${action} deveria ter variante -`);
  }
  for (const name of ['stamina', 'net', 'tiebreak', 'weather-sun']) {
    assert.ok(ICON_SOURCES[name], `${name} deveria existir`);
  }
});

test('em Node (sem Image) o carregamento é ignorado e nada quebra', () => {
  assert.doesNotThrow(() => loadIcons());
  assert.equal(icon('shot-flat'), null);
  assert.equal(actionIcon('shot-flat', 'forehand'), null);
  assert.equal(iconReady(null), false);
  assert.equal(iconReady({ complete: true, naturalWidth: 0 }), false);
  assert.equal(iconReady({ complete: true, naturalWidth: 10 }), true);
  assert.equal(drawIcon({ save() {}, restore() {}, drawImage() {} }, null, 0, 0, 20), false);
});
