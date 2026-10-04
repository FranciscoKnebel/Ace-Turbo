import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyShot, createWorld, executeRallyShot } from '../src/sim/world.js';
import { stepBall, isInCourt } from '../src/sim/physics.js';

test('classificação da batida vem da tecla (flat por padrão)', () => {
  assert.equal(classifyShot({ shot: 'flat' }), 'flat');
  assert.equal(classifyShot({ shot: 'topspin' }), 'topspin');
  assert.equal(classifyShot({ shot: 'slice' }), 'slice');
  assert.equal(classifyShot({ shot: 'lob' }), 'lob');
  assert.equal(classifyShot({}), 'flat');
  assert.equal(classifyShot(undefined), 'flat');
  assert.equal(classifyShot({ shot: 'inventado' }), 'flat');
});

// Executa um golpe isolado (sem IA) e mede a trajetória.
function playShot(seed, shot, { charge = 0.8, aimFwd = 0, lateral = 0 } = {}) {
  const world = createWorld({ mode: 'singles', seed });
  const p = world.byId.a1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  p.input = {
    up: aimFwd > 0,
    down: aimFwd < 0,
    left: false,
    right: false,
    swing: true,
    shot,
  };
  p.x = 0;
  p.y = -10;
  p.swing = { t: 0, didHit: false, charge, shot };
  const ball = world.ball;
  Object.assign(ball, {
    x: lateral,
    y: -9,
    z: 0.8,
    px: lateral,
    py: -9,
    vx: 0,
    vy: 0,
    vz: 0,
    heldBy: null,
    dead: false,
    bounces: [],
    touchedNet: false,
    crossed: false,
    onGround: false,
    lastHit: { team: 'b', player: 'b1', isServe: false },
  });
  executeRallyShot(world, p, ball);

  let peakPre = 0;
  let peakPost = 0;
  let firstBounceT = null;
  let firstBounce = null;
  let t = 0;
  const dt = 1 / 120;
  const events = [];
  for (let i = 0; i < 120 * 8; i++) {
    stepBall(ball, dt, false, events);
    t += dt;
    if (ball.bounces.length === 0) peakPre = Math.max(peakPre, ball.z);
    if (ball.bounces.length === 1) peakPost = Math.max(peakPost, ball.z);
    if (ball.bounces.length >= 1 && firstBounceT === null) {
      firstBounceT = t;
      firstBounce = { x: ball.bounces[0].x, y: ball.bounces[0].y, inCourt: ball.bounces[0].inCourt };
    }
    if (ball.bounces.length >= 2 || ball.dead) break;
  }
  return { world, ball, peakPre, peakPost, firstBounceT, firstBounce };
}

test('top spin é mais fundo e quica mais alto que a flat', () => {
  const flat = playShot(4, 'flat', { aimFwd: 1 });
  const top = playShot(4, 'topspin', { aimFwd: 1 });
  assert.equal(top.ball.spin, 'topspin');
  assert.equal(flat.ball.spin, 'flat');
  // Compara a profundidade média com mira neutra (o erro varia cada golpe).
  const avg = (shot) => {
    let sum = 0;
    for (let seed = 1; seed <= 12; seed++) sum += playShot(seed, shot, { aimFwd: 0 }).firstBounce.y;
    return sum / 12;
  };
  const avgFlat = avg('flat');
  const avgTop = avg('topspin');
  assert.ok(
    avgTop > avgFlat + 0.2,
    `top spin deveria cair mais fundo em média (${avgTop.toFixed(2)} vs ${avgFlat.toFixed(2)})`,
  );
  assert.ok(
    top.peakPost > flat.peakPost * 1.15,
    `top spin deveria quicar mais alto (${top.peakPost.toFixed(2)} vs ${flat.peakPost.toFixed(2)})`,
  );
  assert.equal(top.ball.bounceScale, 1.3);
});

test('top spin arrisca mais (mais bolas fora) que a flat', () => {
  let flatOuts = 0;
  let topOuts = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const flat = playShot(seed, 'flat', { aimFwd: 1 });
    const top = playShot(seed, 'topspin', { aimFwd: 1 });
    if (flat.firstBounce && !flat.firstBounce.inCourt) flatOuts++;
    if (top.firstBounce && !top.firstBounce.inCourt) topOuts++;
  }
  assert.ok(topOuts > flatOuts, `top spin deveria errar mais (${topOuts} vs ${flatOuts})`);
  assert.ok(topOuts > 0, 'top spin deveria gerar bolas fora em algumas sementes');
});

test('slice é mais lenta e quica mais baixo', () => {
  const flat = playShot(4, 'flat');
  const slice = playShot(4, 'slice');
  assert.equal(slice.ball.spin, 'slice');
  assert.ok(slice.firstBounceT > flat.firstBounceT, 'slice demora mais para chegar');
  assert.ok(
    slice.peakPost < flat.peakPost * 0.85,
    `slice deveria quicar mais baixo (${slice.peakPost.toFixed(2)} vs ${flat.peakPost.toFixed(2)})`,
  );
  assert.equal(slice.ball.bounceScale, 0.5);
});

test('lob é aéreo: passa bem mais alto que a flat', () => {
  const flat = playShot(5, 'flat');
  const lob = playShot(5, 'lob');
  assert.equal(lob.ball.spin, 'lob');
  assert.ok(
    lob.peakPre > flat.peakPre * 1.4,
    `lob deveria subir mais (${lob.peakPre.toFixed(2)} vs ${flat.peakPre.toFixed(2)})`,
  );
});

test('forehand e backhand: lado do corpo define a mão', () => {
  const fh = playShot(7, 'flat', { lateral: 0.9 }); // bola à direita de A
  assert.equal(fh.ball.lastHit.hand, 'forehand');
  assert.equal(fh.world.stats.hands.forehand, 1);

  const bh = playShot(7, 'flat', { lateral: -0.9 }); // bola à esquerda de A
  assert.equal(bh.ball.lastHit.hand, 'backhand');
  assert.equal(bh.world.stats.hands.backhand, 1);

  const neutral = playShot(7, 'flat', { lateral: 0 });
  assert.equal(neutral.ball.lastHit.hand, 'neutral');
});

test('estatísticas contam os tipos de batida e as mãos', () => {
  const world = createWorld({ mode: 'singles', seed: 6 });
  const p = world.byId.a1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  for (const [shot, lateral] of [
    ['flat', 0],
    ['topspin', 0.8],
    ['slice', -0.8],
    ['lob', 0],
  ]) {
    p.input = { up: false, down: false, left: false, right: false, swing: true, shot };
    p.x = 0;
    p.y = -10;
    p.swing = { t: 0, didHit: false, charge: 0.6, shot };
    const ball = world.ball;
    Object.assign(ball, {
      x: lateral,
      y: -9,
      z: 0.8,
      px: lateral,
      py: -9,
      vx: 0,
      vy: 0,
      vz: 0,
      heldBy: null,
      dead: false,
      bounces: [],
      touchedNet: false,
      crossed: false,
      onGround: false,
      lastHit: { team: 'b', player: 'b1', isServe: false },
    });
    executeRallyShot(world, p, ball);
  }
  assert.deepEqual(world.stats.shots, { flat: 1, topspin: 1, slice: 1, lob: 1 });
  assert.deepEqual(world.stats.hands, { forehand: 1, backhand: 1, neutral: 2 });
});

test('quique da flat fica dentro da quadra (chute seguro)', () => {
  const flat = playShot(11, 'flat', { aimFwd: 1 });
  assert.ok(isInCourt(flat.firstBounce.x, flat.firstBounce.y, false));
});
