import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import {
  computeView,
  drawGameOver,
  drawHelp,
  drawMatch,
  drawMenu,
  drawPause,
  MODE_ORDER,
  project,
  racketWorldPosition,
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
      if (prop === 'strokeStyle' || prop === 'fillStyle') {
        (calls[prop] ??= []).push(value);
      }
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

test('menu lista os quatro modos, os ajustes e o "Como jogar"', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  drawMenu(ctx, view, { modeIndex: 0, difficultyIndex: 2, bestOfIndex: 1, focus: 6 });
  const drawn = texts(ctx);
  assert.ok(drawn.some((t) => t.includes('ACE TURBO')));
  assert.ok(drawn.some((t) => t.includes('Co-op Duplas')));
  assert.ok(drawn.some((t) => t.includes('Simples')));
  assert.ok(drawn.some((t) => t.includes('Versus')));
  assert.ok(drawn.some((t) => t.includes('Demo')));
  assert.ok(drawn.some((t) => t.includes('Difícil')));
  assert.ok(drawn.some((t) => t.includes('melhor de 3')));
  assert.ok(drawn.some((t) => t.includes('Como jogar')));
  assert.ok(drawn.some((t) => t.includes('Q / E')));
});

test('indicador Q/E aparece só em dificuldade e partida', () => {
  const view = computeView(1280, 720);
  const ctxMode = fakeContext();
  drawMenu(ctxMode, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, focus: 0 });
  assert.ok(
    !texts(ctxMode).some((t) => t.includes('Q ◀ ▶ E')),
    'modo não deve mostrar o indicador Q/E',
  );
  const ctxDiff = fakeContext();
  drawMenu(ctxDiff, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, focus: 4 });
  assert.ok(
    texts(ctxDiff).some((t) => t.includes('Q ◀ ▶ E')),
    'dificuldade deve mostrar o indicador Q/E',
  );
  const ctxBest = fakeContext();
  drawMenu(ctxBest, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, focus: 5 });
  assert.ok(
    texts(ctxBest).some((t) => t.includes('Q ◀ ▶ E')),
    'partida deve mostrar o indicador Q/E',
  );
  const ctxHelp = fakeContext();
  drawMenu(ctxHelp, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, focus: 6 });
  assert.ok(
    !texts(ctxHelp).some((t) => t.includes('Q ◀ ▶ E')),
    'como jogar não deve mostrar o indicador Q/E',
  );
});

test('menu numera todos os itens (1 a 7)', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  drawMenu(ctx, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, focus: 0 });
  const drawn = texts(ctx).join('\n');
  for (const label of ['Co-op Duplas', 'Simples', 'Versus', 'Demo', 'Dificuldade', 'Partida', 'Como jogar']) {
    assert.ok(drawn.includes(label), `menu deveria listar ${label}`);
  }
  assert.ok(drawn.includes('1 a 7'), 'dica dos atalhos numéricos');
});

test('tela "Como jogar" mostra controles, batidas, saque e regras', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  assert.doesNotThrow(() => drawHelp(ctx, view));
  const drawn = texts(ctx).join('\n');
  assert.ok(drawn.includes('COMO JOGAR'));
  assert.ok(drawn.includes('J top spin'));
  assert.ok(drawn.includes('K slice'));
  assert.ok(drawn.includes('L lob'));
  assert.ok(drawn.includes('CONTROLES'));
  assert.ok(drawn.includes('BATIDAS'));
  assert.ok(drawn.includes('SAQUE'));
  assert.ok(drawn.includes('PONTUAÇÃO'));
  assert.ok(drawn.includes('deuce'));
  assert.ok(drawn.includes('ESC ou ENTER'));
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

test('raquete fica visível o tempo todo e encosta na bola no alcance', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  const world = createWorld({ mode: 'singles', seed: 1 });
  assert.ok(world.players.every((p) => !p.swing), 'ninguém está no golpe');
  drawMatch(ctx, world, view, makeFx());
  const strokes = ctx.__calls.strokeStyle ?? [];
  assert.ok(strokes.includes('#f8fafc'), 'aro da raquete desenhado mesmo parado');

  // A raquete aponta para a bola e a alcança quando ela está perto.
  const p = world.byId.a1;
  const ball = world.ball;
  Object.assign(ball, { x: p.x + 0.9, y: p.y, z: 0.8, dead: false, heldBy: null });
  const racket = racketWorldPosition(p, ball);
  const d = Math.hypot(racket.x - ball.x, racket.y - ball.y);
  assert.ok(d < 0.2, `raquete deveria encostar na bola (d=${d.toFixed(2)})`);
});

test('efeitos de impacto e etiqueta da batida são desenhados', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  const world = createWorld({ mode: 'singles', seed: 1 });
  const fx = makeFx();
  fx.impacts = [{ x: 0, y: -5, z: 0.8, life: 0.2, max: 0.28, rgb: '125,211,252' }];
  fx.labels = [{ playerId: 'a1', text: 'SLICE', life: 0.5, max: 0.7, rgb: '125,211,252' }];
  assert.doesNotThrow(() => drawMatch(ctx, world, view, fx));
  const texts = (ctx.__calls.fillText ?? []).map((a) => String(a[0]));
  assert.ok(texts.includes('SLICE'), 'etiqueta do tipo de batida');
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
