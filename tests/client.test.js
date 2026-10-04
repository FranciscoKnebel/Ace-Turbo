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

  let t = 0;
  const frame = (n = 1) => {
    runFrames(n, t);
    t += n * 16.7;
  };
  const tap = (code) => {
    press(code);
    frame();
    release(code);
    frame();
  };

  // Menu → abre "Como jogar" (última opção) e volta.
  frame(2);
  for (let i = 0; i < 7; i++) tap('ArrowDown');
  tap('Enter'); // abre a ajuda (item 8)
  frame(2);
  tap('Enter'); // volta ao menu

  // Menu → começa uma partida co-op (foco no primeiro modo).
  tap('Digit1');
  tap('Enter');

  // Joga alguns segundos com P1 segurando e soltando o golpe.
  press('Space');
  frame(30);
  release('Space');
  press('KeyW');
  frame(30);
  release('KeyW');
  press('Space');
  frame(10);
  release('Space');
  frame(120);

  // Pausa e despausa.
  tap('KeyP');
  frame(2);
  tap('KeyP');
  frame(2);

  // Volta ao menu e configura com Q/E antes de iniciar o modo versus.
  tap('KeyM');
  tap('Digit3');
  tap('ArrowDown'); // foco em Dificuldade
  tap('KeyE'); // muda a dificuldade
  tap('KeyQ'); // volta a dificuldade
  tap('ArrowDown'); // foco em Partida
  tap('KeyE'); // alterna 1 set / melhor de 3
  tap('Enter');
  frame(120);

  assert.ok(true, 'client rodou sem exceções');
});
