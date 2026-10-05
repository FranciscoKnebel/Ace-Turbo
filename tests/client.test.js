import test from 'node:test';
import assert from 'node:assert/strict';

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
