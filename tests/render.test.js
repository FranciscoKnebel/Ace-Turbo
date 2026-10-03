import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import {
  computeView,
  drawGameOver,
  drawMatch,
  drawMenu,
  drawPause,
  MODE_ORDER,
} from '../src/render.js';

// Contexto 2D falso: registra chamadas e devolve no-ops para tudo que o render usa.
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

function makeFx() {
  return {
    trail: [{ x: 0, y: 2, z: 1, life: 0.2, max: 0.3 }],
    marks: [{ x: 1, y: -3, life: 0.3, max: 0.5 }],
    shake: 3,
  };
}

test('render não explode para nenhum modo, inclusive menu e overlays', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  for (const mode of MODE_ORDER) {
    const world = createWorld({ mode, seed: 2 });
    for (let i = 0; i < 240; i++) stepWorld(world, 1 / 120);
    assert.doesNotThrow(() => drawMatch(ctx, world, view, makeFx()), `drawMatch ${mode}`);
    assert.doesNotThrow(() => drawGameOver(ctx, view, world), `drawGameOver ${mode}`);
  }
  assert.doesNotThrow(() => drawMenu(ctx, view, { modeIndex: 0, difficultyIndex: 1 }));
  assert.doesNotThrow(() => drawPause(ctx, view));
});

test('render desenha a bola na mão do sacador e em voo', () => {
  const ctx = fakeContext();
  const view = computeView(800, 600);
  const world = createWorld({ mode: 'singles', seed: 1 });
  assert.ok(world.ball.heldBy, 'começa com a bola na mão');
  assert.doesNotThrow(() => drawMatch(ctx, world, view, makeFx()));
  for (let i = 0; i < 200; i++) stepWorld(world, 1 / 120);
  assert.doesNotThrow(() => drawMatch(ctx, world, view, makeFx()));
});

test('módulos do cliente importam sem DOM', async () => {
  await assert.doesNotReject(() => import('../src/main.js'));
  await assert.doesNotReject(() => import('../src/audio.js'));
  await assert.doesNotReject(() => import('../src/input.js'));
});
