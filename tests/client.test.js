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

  press('KeyW');
  press('KeyD');
  press('Space');
  let p1 = inputForSlot(kb, 1);
  assert.deepEqual(p1, { up: true, down: false, left: false, right: true, swing: true });
  let p2 = inputForSlot(kb, 2);
  assert.deepEqual(p2, { up: false, down: false, left: false, right: false, swing: false });

  press('ArrowDown');
  press('ArrowLeft');
  press('Enter');
  p2 = inputForSlot(kb, 2);
  assert.deepEqual(p2, { up: false, down: true, left: true, right: false, swing: true });

  release('KeyW');
  release('Space');
  release('ArrowDown');
  release('ArrowLeft');
  release('Enter');
  release('KeyD');
  assert.deepEqual(inputForSlot(kb, 1), {
    up: false,
    down: false,
    left: false,
    right: false,
    swing: false,
  });
  assert.deepEqual(inputForSlot(kb, 2), {
    up: false,
    down: false,
    left: false,
    right: false,
    swing: false,
  });
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

test('boot do cliente roda frames, inicia partida, pausa e volta ao menu', async () => {
  const listeners = {};
  const rafQueue = [];
  const canvas = {
    style: {},
    width: 0,
    height: 0,
    getContext: () => fakeContext(),
  };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  globalThis.document = { getElementById: () => canvas };
  globalThis.requestAnimationFrame = (cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };

  // Importa o main; o boot deve rodar por causa dos globais simulados.
  await assert.doesNotReject(() => import('../src/main.js?boot-test'));

  const press = (code) => {
    for (const fn of listeners.keydown ?? []) fn({ code, repeat: false, preventDefault() {} });
  };
  const release = (code) => {
    for (const fn of listeners.keyup ?? []) fn({ code });
  };
  const runFrames = (n, startAt = 0) => {
    for (let i = 0; i < n; i++) {
      const cb = rafQueue.shift();
      assert.ok(cb, 'requestAnimationFrame deve ter sido agendado');
      cb(startAt + i * 16.7);
    }
  };

  // Menu → começa uma partida co-op.
  runFrames(2);
  press('Enter');
  runFrames(1);
  release('Enter');

  // Joga alguns segundos com P1 segurando e soltando o golpe.
  press('Space');
  runFrames(30, 100);
  release('Space');
  press('KeyW');
  runFrames(30, 600);
  release('KeyW');
  press('Space');
  runFrames(10, 1100);
  release('Space');
  runFrames(120, 1300);

  // Pausa e despausa.
  press('KeyP');
  runFrames(2, 3400);
  release('KeyP');
  press('KeyP');
  runFrames(2, 3500);
  release('KeyP');

  // Volta ao menu e inicia o modo versus, exercitando os atalhos do menu.
  press('KeyM');
  runFrames(1, 3700);
  release('KeyM');
  press('Digit3');
  runFrames(1, 3750);
  release('Digit3');
  press('Enter');
  runFrames(1, 3800);
  release('Enter');
  runFrames(120, 3900);

  assert.ok(true, 'client rodou sem exceções');
});
