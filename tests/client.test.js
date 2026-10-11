import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard, inputForSlot, pumpHumanInputs, slotForPlayer } from '../src/input.js';
import { createWorld } from '../src/sim/world.js';

test('mapeamento de teclado: P1 (WASD+Espaço) e P2 (setas+Enter)', () => {
  const listeners = {};
  const target = {
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  const kb = createKeyboard(target);
  const press = (code) => {
    for (const fn of listeners.keydown ?? []) fn({ code, repeat: false, preventDefault() {} });
  };
  const release = (code) => {
    for (const fn of listeners.keyup ?? []) fn({ code });
  };
  const blank = {
    up: false,
    down: false,
    left: false,
    right: false,
    swing: false,
    shot: 'flat',
    topspin: false,
    slice: false,
    lob: false,
    sprint: false,
    aim: null,
  };

  press('KeyW');
  press('KeyD');
  press('Space');
  let p1 = inputForSlot(kb, 1);
  assert.deepEqual(p1, { ...blank, up: true, right: true, swing: true });
  let p2 = inputForSlot(kb, 2);
  assert.deepEqual(p2, blank);

  press('ArrowDown');
  press('ArrowLeft');
  press('Enter');
  p2 = inputForSlot(kb, 2);
  assert.deepEqual(p2, { ...blank, down: true, left: true, swing: true });

  release('KeyW');
  release('Space');
  release('ArrowDown');
  release('ArrowLeft');
  release('Enter');
  release('KeyD');
  assert.deepEqual(inputForSlot(kb, 1), blank);
  assert.deepEqual(inputForSlot(kb, 2), blank);
});

test('teclas de batida: flat, top spin, slice e lob para P1 e P2', () => {
  const listeners = {};
  const kb = createKeyboard({
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
  });
  const press = (code) => {
    for (const fn of listeners.keydown ?? []) fn({ code, repeat: false, preventDefault() {} });
  };
  const release = (code) => {
    for (const fn of listeners.keyup ?? []) fn({ code });
  };
  const cases = [
    [1, 'KeyJ', 'topspin'],
    [1, 'KeyK', 'slice'],
    [1, 'KeyL', 'lob'],
    [1, 'Space', 'flat'],
    [2, 'Comma', 'topspin'],
    [2, 'Period', 'slice'],
    [2, 'Slash', 'lob'],
    [2, 'Enter', 'flat'],
    [2, 'Numpad1', 'topspin'],
    [2, 'Numpad2', 'slice'],
    [2, 'Numpad3', 'lob'],
  ];
  for (const [slot, code, shot] of cases) {
    press(code);
    const input = inputForSlot(kb, slot);
    assert.equal(input.shot, shot, `${code} deveria ser ${shot}`);
    assert.equal(input.swing, true, `${code} deveria armar o golpe`);
    release(code);
  }
});

test('pumpHumanInputs preenche P1 e P2 no modo co-op', () => {
  const listeners = {};
  const kb = createKeyboard({
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
  });
  for (const fn of listeners.keydown ?? []) {
    fn({ code: 'KeyW', repeat: false, preventDefault() {} });
    fn({ code: 'ArrowUp', repeat: false, preventDefault() {} });
  }
  const world = createWorld({ mode: 'coop', seed: 1 });
  pumpHumanInputs(kb, world);
  assert.equal(world.inputs.a1.up, true, 'P1 move para a rede');
  assert.equal(world.inputs.a2.up, true, 'P2 move para a rede');
  assert.equal(slotForPlayer('a1'), 1);
  assert.equal(slotForPlayer('a2'), 2);
  assert.equal(slotForPlayer('b1'), 2);
});

// Simula o ambiente do navegador para executar o boot do cliente de verdade.
function fakeContext() {
  const target = {
    canvas: { width: 1280, height: 720 },
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      const noop = () => {};
      t[prop] = noop;
      return noop;
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
}

test('boot: modos por setas e atalhos, telas e configurações têm estado verificável', async (t) => {
  const { boot } = await import('../src/main.js');
  const names = ['window', 'document', 'requestAnimationFrame'];
  const saved = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const listeners = {};
  const rafQueue = [];
  const canvas = { style: {}, getContext: () => fakeContext() };
  globalThis.window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
  };
  globalThis.document = { getElementById: () => canvas };
  globalThis.requestAnimationFrame = cb => rafQueue.push(cb);
  const client = boot();
  let now = performance.now();
  const frame = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const cb = rafQueue.shift();
      assert.ok(cb);
      cb(now += 1000 / 60);
    }
  };
  const tap = code => {
    for (const fn of listeners.keydown) fn({ code, repeat: false, preventDefault() {} });
    frame();
    for (const fn of listeners.keyup) fn({ code });
    frame();
  };
  frame();
  for (const [index, mode] of ['coop', 'singles', 'versus', 'demo'].entries()) {
    tap('Digit1');
    for (let n = 0; n < index; n++) tap('ArrowDown');
    tap('Enter');
    assert.equal(client.getState().screen, 'loading');
    assert.equal(client.getState().world.mode, mode);
    tap('Enter');
    assert.equal(client.getState().screen, 'playing');
    tap('KeyP');
    assert.equal(client.getState().paused, true);
    tap('KeyP');
    assert.equal(client.getState().paused, false);
    tap('KeyM');
    tap(`Digit${index + 1}`);
    tap('Enter');
    assert.equal(client.getState().world.mode, mode);
    tap('KeyM');
  }
  tap('Digit7'); tap('Enter');
  assert.equal(client.getState().screen, 'help');
  tap('Escape');
  tap('Digit6'); tap('Enter');
  assert.equal(client.getState().screen, 'players');
  const before = JSON.stringify(client.getState().menu.players.config);
  tap('ArrowRight');
  assert.notEqual(JSON.stringify(client.getState().menu.players.config), before);
  tap('Escape');
  tap('Digit5'); tap('Enter');
  assert.equal(client.getState().screen, 'settings');
  tap('KeyE');
  assert.equal(client.getState().menu.difficultyIndex, 1);
  tap('ArrowRight');
  assert.equal(client.getState().menu.settings.category, 1);
  tap('KeyE');
  assert.equal(client.getState().menu.surfaceIndex, 1);
  tap('Escape');
  assert.equal(client.getState().screen, 'menu');
  client.dispose();
});
