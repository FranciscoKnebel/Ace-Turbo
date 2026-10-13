import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, staminaMaxOf, stepWorld } from '../src/sim/world.js';
import {
  computeView,
  drawGameOver,
  drawHelp,
  drawMatch,
  drawMenu,
  drawPause,
  menuRows,
  MODE_ORDER,
  staminaBarColor,
  project,
  racketWorldPosition,
} from '../src/render.js';

// Contexto 2D falso que registra as chamadas de desenho.
function fakeContext() {
  const calls = {};
  const target = {
    canvas: { width: 1280, height: 720 },
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => ({
      addColorStop: (...args) => {
        (calls.gradientStops ??= []).push(args);
      },
    }),
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
  const ctxLang = fakeContext();
  drawMenu(ctxLang, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, langIndex: 0, focus: 6 });
  assert.ok(
    texts(ctxLang).some((t) => t.includes('Q ◀ ▶ E')),
    'idioma deve mostrar o indicador Q/E',
  );
  const ctxWeather = fakeContext();
  drawMenu(ctxWeather, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, focus: 8 });
  assert.ok(
    texts(ctxWeather).some((t) => t.includes('Q ◀ ▶ E')),
    'clima deve mostrar o indicador Q/E',
  );
  const ctxHelp = fakeContext();
  drawMenu(ctxHelp, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, focus: 10 });
  assert.ok(
    !texts(ctxHelp).some((t) => t.includes('Q ◀ ▶ E')),
    'como jogar não deve mostrar o indicador Q/E',
  );
});

test('menu numera todos os itens (1 a 9)', () => {
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  drawMenu(ctx, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, focus: 0 });
  const drawn = texts(ctx).join('\n');
  for (const label of [
    'Co-op Duplas',
    'Simples',
    'Versus',
    'Demo',
    'Dificuldade',
    'Partida',
    'Idioma',
    'Quadra',
    'Clima',
    'Jogadores',
    'Como jogar',
  ]) {
    assert.ok(drawn.includes(label), `menu deveria listar ${label}`);
  }
  assert.ok(drawn.includes('1 a 9'), 'dica dos atalhos numéricos');
  assert.ok(drawn.includes('Duro'), 'quadra padrão listada');
  assert.ok(drawn.includes('Noite'), 'clima padrão listado');
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
  await assert.doesNotReject(() => import('../src/media.js'));
});

test('tela de jogadores mostra classes e stats, com personalização', async () => {
  const { drawPlayers } = await import('../src/render.js');
  const view = computeView(1280, 720);
  const menu = {
    modeIndex: 0,
    difficultyIndex: 0,
    bestOfIndex: 0,
    langIndex: 0,
    focus: 0,
    players: { focus: 0, selected: 0, config: {} },
  };
  const ctx = fakeContext();
  drawPlayers(ctx, view, menu);
  const drawn = texts(ctx).join('\n');
  assert.ok(drawn.includes('JOGADORES'));
  assert.ok(drawn.includes('Equilibrado'), 'humano começa equilibrado');
  assert.ok(drawn.includes('Aleatória'), 'CPU começa aleatória');
  for (const stat of ['Força', 'Técnica', 'Saque', 'Vigor']) {
    assert.ok(drawn.includes(stat), `deveria listar a stat ${stat}`);
  }
  menu.players.config.a1 = {
    classId: 'custom',
    stats: { power: 99, technique: 51, serve: 60, stamina: 88 },
  };
  const ctx2 = fakeContext();
  drawPlayers(ctx2, view, menu);
  const drawn2 = texts(ctx2).join('\n');
  assert.ok(drawn2.includes('Personalizado'), 'stats editadas viram personalizado');
  assert.ok(drawn2.includes('99') && drawn2.includes('51'), 'valores editados aparecem');
});

test('cor da barra de vigor: azul, âmbar no cansaço e vermelho no limite', () => {
  assert.equal(staminaBarColor(1, false), '#38bdf8');
  assert.equal(staminaBarColor(0.7, false), '#38bdf8');
  assert.equal(staminaBarColor(0.5, false), '#fbbf24');
  assert.equal(staminaBarColor(0.26, false), '#fbbf24');
  assert.equal(staminaBarColor(0.2, false), '#f87171');
  assert.equal(staminaBarColor(0.2, true), '#22d3ee', 'correndo fica ciano');
});

test('cansaço é mostrado só pela barra (cor e pulso), sem rótulo', async () => {
  const { drawMatch } = await import('../src/render.js');
  const view = computeView(1280, 720);
  const world = createWorld({ mode: 'singles', seed: 30 });
  for (const p of world.players) p.stamina = staminaMaxOf(p) * 0.1;
  const ctx = fakeContext();
  drawMatch(ctx, world, view, makeFx());
  assert.ok(
    !texts(ctx).some((s) => s === 'Cansado' || s === 'Tired'),
    'a barra cansada não deve ter rótulo',
  );
});

test('atalhos numéricos existem só para as 9 primeiras linhas', () => {
  const rows = menuRows({});
  assert.ok(rows.length > 9, 'menu tem mais de 9 linhas');
  rows.forEach((row, i) => {
    if (i < 9) assert.equal(row.key, String(i + 1), `linha ${i + 1} deveria ter atalho`);
    else assert.ok(!row.key, `linha ${i + 1} não deveria anunciar atalho`);
  });
});

test('prévia da quadra aparece mesmo com a imagem de fundo carregada', async () => {
  const { media } = await import('../src/media.js');
  const view = computeView(1280, 720);
  const saved = media.landing;
  media.landing = { complete: true, naturalWidth: 10 };
  try {
    const ctx = fakeContext();
    drawMenu(ctx, view, { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, surfaceIndex: 1 });
    assert.ok(
      (ctx.__calls.fillStyle ?? []).includes('#b45309'),
      'a linha Quadra deveria mostrar a cor da superfície escolhida',
    );
  } finally {
    media.landing = saved;
  }
});

test('clima escolhido aparece no carregamento, no céu e no HUD', async () => {
  const { drawLoading, drawMatch } = await import('../src/render.js');
  const view = computeView(1280, 720);
  const world = createWorld({ mode: 'singles', seed: 7, weather: 'windy' });
  assert.ok(world.weather.wind, 'ventania deveria ter vento');
  const menu = { modeIndex: 0, difficultyIndex: 1, bestOfIndex: 0, langIndex: 0, weatherIndex: 2 };
  const ctx = fakeContext();
  drawLoading(ctx, view, world, menu, 0.5);
  assert.ok(texts(ctx).join('\n').includes('Clima: Ventania'), 'carregamento mostra o clima');
  // O dia usa a paleta clara de céu.
  const day = createWorld({ mode: 'singles', seed: 7, weather: 'day' });
  const ctxDay = fakeContext();
  drawMatch(ctxDay, day, view, makeFx());
  assert.ok(
    (ctxDay.__calls.gradientStops ?? []).some(([, color]) => color === '#0284c7'),
    'o céu de dia deveria usar a paleta clara',
  );
  // O badge do clima é desenhado (ícone + vento) no HUD.
  const ctxWind = fakeContext();
  drawMatch(ctxWind, world, view, makeFx());
  assert.ok(
    texts(ctxWind).some((s) => s.includes('Vento')),
    'o HUD deveria mostrar o vento',
  );
});

test('superfície escolhida aparece no carregamento e na quadra', async () => {
  const { drawLoading } = await import('../src/render.js');
  const view = computeView(1280, 720);
  const world = createWorld({ mode: 'singles', seed: 6, surface: 'clay' });
  const menu = { modeIndex: 0, difficultyIndex: 1, bestOfIndex: 0, langIndex: 0, surfaceIndex: 1 };
  const ctx = fakeContext();
  drawLoading(ctx, view, world, menu, 0.5);
  assert.ok(texts(ctx).join('\n').includes('Quadra: Saibro'), 'carregamento mostra a quadra');
  // A quadra de saibro usa a cor própria (laranja).
  const ctxMatch = fakeContext();
  drawMatch(ctxMatch, world, view, makeFx());
  assert.ok(
    (ctxMatch.__calls.fillStyle ?? []).includes('#b45309'),
    'a quadra de saibro deveria usar a cor de saibro',
  );
});

test('tela de carregamento mostra modo, formato e jogadores com classes', async () => {
  const { drawLoading } = await import('../src/render.js');
  const ctx = fakeContext();
  const view = computeView(1280, 720);
  const world = createWorld({
    mode: 'coop',
    seed: 5,
    players: { b1: { classId: 'power' }, b2: { classId: 'server' } },
  });
  const menu = { modeIndex: 0, difficultyIndex: 1, bestOfIndex: 0, langIndex: 0 };
  drawLoading(ctx, view, world, menu, 0.5);
  const drawn = texts(ctx).join('\n');
  assert.ok(drawn.includes('CARREGANDO'));
  assert.ok(drawn.includes('Co-op Duplas'), 'modo da partida');
  assert.ok(drawn.includes('4 jogadores'), 'contagem de jogadores');
  assert.ok(drawn.includes('Potência') && drawn.includes('Sacador'), 'classes dos CPUs');
  assert.ok(drawn.includes('Equilibrado'), 'classe dos humanos');
});

test('ações usam ícones: forehand +, backhand - e neutro normal', async () => {
  const { icons } = await import('../src/icons.js');
  const fake = (name) => ({ complete: true, naturalWidth: 512, naturalHeight: 512, name });
  const prev = { ...icons };
  try {
    Object.assign(icons, {
      'shot-topspin-plus': fake('shot-topspin-plus'),
      'shot-topspin-minus': fake('shot-topspin-minus'),
      'shot-topspin': fake('shot-topspin'),
      'turbo-plus': fake('turbo-plus'),
      'turbo-minus': fake('turbo-minus'),
      turbo: fake('turbo'),
      stamina: fake('stamina'),
      net: fake('net'),
      tiebreak: fake('tiebreak'),
      'shot-flat': fake('shot-flat'),
      'shot-slice': fake('shot-slice'),
      'shot-lob': fake('shot-lob'),
      'serve-flat': fake('serve-flat'),
      'serve-lob': fake('serve-lob'),
    });
    const view = computeView(1280, 720);
    const world = createWorld({ mode: 'singles', seed: 1 });

    const renderLabel = (hand, turbo = false) => {
      const ctx = fakeContext();
      const fx = makeFx();
      fx.labels = [
        {
          playerId: 'a1',
          action: 'shot-topspin',
          hand,
          turbo,
          caption: '',
          text: 'TOPSPIN',
          life: 0.5,
          max: 0.7,
          rgb: '253,224,71',
        },
      ];
      drawMatch(ctx, world, view, fx);
      return ctx.__calls.drawImage ?? [];
    };

    const forehand = renderLabel('forehand');
    assert.ok(
      forehand.some((a) => a[0]?.name === 'shot-topspin-plus'),
      'forehand deveria usar o ícone com +',
    );
    const backhand = renderLabel('backhand');
    assert.ok(
      backhand.some((a) => a[0]?.name === 'shot-topspin-minus'),
      'backhand deveria usar o ícone com -',
    );
    const neutral = renderLabel('neutral');
    assert.ok(
      neutral.some((a) => a[0]?.name === 'shot-topspin') &&
        !neutral.some((a) => a[0]?.name?.includes('plus') || a[0]?.name?.includes('minus')),
      'neutro deveria usar o ícone normal',
    );
    const turbo = renderLabel('forehand', true);
    assert.ok(
      turbo.some((a) => a[0]?.name === 'turbo-plus'),
      'golpe turbo deveria mostrar o ícone do turbo',
    );
    const turboBack = renderLabel('backhand', true);
    assert.ok(
      turboBack.some((a) => a[0]?.name === 'turbo-minus'),
      'turbo no backhand deveria usar o selo -',
    );

    // Barra de vigor e placar também usam ícones.
    const staminaCalls = forehand.filter((a) => a[0]?.name === 'stamina');
    assert.ok(staminaCalls.length >= 2, 'barra de vigor com ícone para cada jogador');
  } finally {
    for (const key of Object.keys(icons)) delete icons[key];
    Object.assign(icons, prev);
  }
});

test('telas mudam para inglês quando o idioma é trocado', async () => {
  const { setLang } = await import('../src/i18n.js');
  try {
    setLang('en');
    const view = computeView(1280, 720);
    const ctx = fakeContext();
    drawMenu(ctx, view, { modeIndex: 0, difficultyIndex: 4, bestOfIndex: 0, langIndex: 1, focus: 6 });
    const drawn = texts(ctx).join('\n');
    assert.ok(drawn.includes('How to play'), 'item de ajuda em inglês');
    assert.ok(drawn.includes('Language'), 'item de idioma');
    assert.ok(drawn.includes('Impossible'), 'dificuldade traduzida');
    assert.ok(drawn.includes('1 to 9'), 'dica dos atalhos em inglês');
    assert.ok(drawn.includes('Court') && drawn.includes('Hard'), 'quadra em inglês');
    assert.ok(drawn.includes('Weather') && drawn.includes('Night'), 'clima em inglês');
    const ctxHelp = fakeContext();
    drawHelp(ctxHelp, view);
    assert.ok(texts(ctxHelp).join('\n').includes('HOW TO PLAY'));
    const ctxPause = fakeContext();
    drawPause(ctxPause, view);
    assert.ok(texts(ctxPause).includes('PAUSED'));
    const ctxOver = fakeContext();
    const world = createWorld({ mode: 'versus', seed: 1 });
    world.score.winner = 'a';
    world.score.sets.push({ a: 6, b: 4 });
    drawGameOver(ctxOver, view, world);
    assert.ok(texts(ctxOver).some((s) => s.includes('WINNER')));
  } finally {
    setLang('pt');
  }
});

test('menu usa landing e logo quando as imagens estão prontas', async () => {
  const { media, imageReady, loadMedia } = await import('../src/media.js');
  assert.equal(imageReady(null), false);
  assert.doesNotThrow(() => loadMedia()); // em Node não há Image: não carrega
  const prev = { ...media };
  try {
    media.landing = { complete: true, naturalWidth: 1672, naturalHeight: 941 };
    media.logo = { complete: true, naturalWidth: 2172, naturalHeight: 724 };
    media.logoShort = { complete: true, naturalWidth: 1254, naturalHeight: 1254 };
    const ctx = fakeContext();
    const view = computeView(1280, 720);
    drawMenu(ctx, view, { modeIndex: 0, difficultyIndex: 4, bestOfIndex: 0, focus: 4 });
    const images = ctx.__calls.drawImage ?? [];
    assert.ok(images.length >= 2, `esperava landing + logo (${images.length} imagens)`);
    assert.ok(
      images.some((a) => a[0] === media.landing),
      'o fundo do menu deveria ser a landing',
    );
    assert.ok(
      images.some((a) => a[0] === media.logo),
      'o título do menu deveria ser o logo',
    );
    assert.ok(
      texts(ctx).some((t) => t.includes('Impossível')),
      'o menu deveria mostrar a dificuldade Impossível',
    );
  } finally {
    Object.assign(media, prev);
  }
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
