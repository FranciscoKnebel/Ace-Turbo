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
  project,
} from '../src/render.js';

// Contexto 2D falso que registra as chamadas de desenho.
function fakeContext() {
  const calls = {};
  const target = {
    canvas: { width: 1280, height: 720 },
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    __calls: calls,
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      const fn = (...args) => {
        (calls[prop] ??= []).push(args);
      };
      t[prop] = fn;
      return fn;
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
}

const texts = (ctx) => (ctx.__calls.fillText ?? []).map((a) => String(a[0]));

function makeFx() {
  return {
    trail: [{ x: 0, y: 2, z: 1, life: 0.2, max: 0.3 }],
    marks: [{ x: 1, y: -3, life: 0.3, max: 0.5 }],
    shake: 0,
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

test('HUD mostra nomes, placar e mensagem', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  const world = createWorld({ mode: 'singles', seed: 1 });
  world.message = 'LET: REPETE O SAQUE';
  world.messageTimer = 2;
  drawMatch(ctx, world, view, makeFx());
  const drawn = texts(ctx);
  assert.ok(drawn.includes('VOCÊ'), `esperava VOCÊ em ${drawn.slice(0, 12)}`);
  assert.ok(drawn.includes('CPU'));
  assert.ok(drawn.some((t) => t.includes('LET')), 'mensagem do juiz');
  assert.ok(drawn.some((t) => t.includes('MELHOR DE 3')), 'formato da partida');
  assert.ok((ctx.__calls.stroke?.length ?? 0) > 15, 'linhas da quadra desenhadas');
  assert.ok((ctx.__calls.arc?.length ?? 0) > 2, 'jogadores e bola desenhados');
});

test('tela de fim de jogo anuncia o vencedor e o placar', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  const world = createWorld({ mode: 'versus', seed: 1 });
  world.score.setsWon.a = 2;
  world.score.sets.push({ a: 6, b: 4 }, { a: 6, b: 3 });
  world.score.winner = 'a';
  drawGameOver(ctx, view, world);
  const drawn = texts(ctx);
  assert.ok(drawn.some((t) => t.includes('VITÓRIA')), `esperava VITÓRIA em ${drawn}`);
  assert.ok(drawn.some((t) => t.includes('6-4')), 'placar dos sets');
  assert.ok(drawn.some((t) => t.includes('[R]')), 'atalhos de revanche');
});

test('menu lista os quatro modos e a dificuldade', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  drawMenu(ctx, view, { modeIndex: 0, difficultyIndex: 2 });
  const drawn = texts(ctx);
  assert.ok(drawn.some((t) => t.includes('ACE TURBO')));
  assert.ok(drawn.some((t) => t.includes('Co-op Duplas')));
  assert.ok(drawn.some((t) => t.includes('Simples')));
  assert.ok(drawn.some((t) => t.includes('Versus')));
  assert.ok(drawn.some((t) => t.includes('Demo')));
  assert.ok(drawn.some((t) => t.includes('Difícil')));
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

test('rastro e marcas da bola usam coordenadas do mundo (x, y)', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  const world = createWorld({ mode: 'singles', seed: 1 });
  const fx = makeFx();
  fx.trail = [{ x: 3, y: 5, z: 1, life: 0.2, max: 0.3 }];
  fx.marks = [{ x: -2, y: 7, life: 0.3, max: 0.5 }];
  drawMatch(ctx, world, view, fx);
  const arcs = ctx.__calls.arc ?? [];
  const ellipses = ctx.__calls.ellipse ?? [];
  assert.ok(
    arcs.some(([x, y]) => Math.hypot(x - project(view, 3, 5, 1).x, y - project(view, 3, 5, 1).y) < 3),
    'rastro projetado corretamente',
  );
  assert.ok(
    ellipses.some(
      ([x, y]) => Math.hypot(x - project(view, -2, 7, 0).x, y - project(view, -2, 7, 0).y) < 3,
    ),
    'marca de quique projetada corretamente',
  );
});

test('câmera em perspectiva: quadra enquadrada e com profundidade', () => {
  for (const [w, h] of [
    [1280, 720],
    [800, 600],
  ]) {
    const v = computeView(w, h);
    const near = project(v, 0, -11.885, 0);
    const far = project(v, 0, 11.885, 0);
    assert.ok(near && far, 'projeta as linhas de fundo');
    assert.ok(far.y < near.y, 'linha de fundo oposta aparece acima na tela');
    const nearLeft = project(v, -5.485, -11.885, 0);
    const nearRight = project(v, 5.485, -11.885, 0);
    const farLeft = project(v, -5.485, 11.885, 0);
    const farRight = project(v, 5.485, 11.885, 0);
    const nearW = nearRight.x - nearLeft.x;
    const farW = farRight.x - farLeft.x;
    assert.ok(nearW > farW * 1.5, `perspectiva: fundo mais estreito (${nearW} vs ${farW})`);
    for (const p of [nearLeft, nearRight, farLeft, farRight]) {
      assert.ok(p.x > -20 && p.x < w + 20 && p.y > -20 && p.y < h + 20, `ponto fora da tela: ${JSON.stringify(p)}`);
    }
    const netTop = project(v, 0, 0, 0.914);
    const highBall = project(v, 0, 0, 3);
    assert.ok(highBall.y < netTop.y - 20, 'a altura (z) é visível na projeção');
  }
});
