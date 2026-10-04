import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyShot, createWorld, executeRallyShot } from '../src/sim/world.js';
import { stepBall } from '../src/sim/physics.js';

test('classificação da batida: top spin, slice e lob', () => {
  assert.equal(classifyShot(1, 0.5), 'topspin');
  assert.equal(classifyShot(0, 0.9), 'topspin');
  assert.equal(classifyShot(-1, 0.2), 'lob');
  assert.equal(classifyShot(-1, 0.5), 'lob');
  assert.equal(classifyShot(-1, 0.8), 'slice');
});

// Executa um golpe isolado (sem IA) e mede a trajetória.
function playShot(seed, fwd, charge) {
  const world = createWorld({ mode: 'singles', seed });
  const p = world.byId.a1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  p.input = { up: fwd > 0, down: fwd < 0, left: false, right: false, swing: false };
  p.x = 0;
  p.y = -10;
  p.swing = { t: 0, didHit: false, charge };
  const ball = world.ball;
  Object.assign(ball, {
    x: 0,
    y: -9,
    z: 0.8,
    px: 0,
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
  let t = 0;
  const dt = 1 / 120;
  const events = [];
  for (let i = 0; i < 120 * 8; i++) {
    stepBall(ball, dt, false, events);
    t += dt;
    if (ball.bounces.length === 0) peakPre = Math.max(peakPre, ball.z);
    if (ball.bounces.length === 1) peakPost = Math.max(peakPost, ball.z);
    if (ball.bounces.length === 1 && firstBounceT === null) firstBounceT = t;
    if (ball.bounces.length >= 2 || ball.dead) break;
  }
  return { ball, peakPre, peakPost, firstBounceT, t };
}

test('slice é mais lenta e quica mais baixo que o top spin', () => {
  const top = playShot(4, 1, 0.8);
  const slice = playShot(4, -1, 0.8);
  assert.equal(top.ball.spin, 'topspin');
  assert.equal(slice.ball.spin, 'slice');
  assert.ok(slice.firstBounceT > top.firstBounceT, 'slice demora mais para chegar');
  assert.ok(
    slice.peakPost < top.peakPost * 0.8,
    `slice deveria quicar mais baixo (${slice.peakPost.toFixed(2)} vs ${top.peakPost.toFixed(2)})`,
  );
  assert.equal(slice.ball.bounceScale, 0.5);
});

test('lob é aéreo: passa bem mais alto que o top spin', () => {
  const top = playShot(5, 1, 0.8);
  const lob = playShot(5, -1, 0.3);
  assert.equal(lob.ball.spin, 'lob');
  assert.ok(
    lob.peakPre > top.peakPre * 1.4,
    `lob deveria subir mais (${lob.peakPre.toFixed(2)} vs ${top.peakPre.toFixed(2)})`,
  );
});

test('estatísticas contam os tipos de batida', () => {
  const world = createWorld({ mode: 'singles', seed: 6 });
  const p = world.byId.a1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  for (const [fwd, charge] of [
    [1, 0.8],
    [-1, 0.8],
    [-1, 0.3],
  ]) {
    p.input = { up: fwd > 0, down: fwd < 0, left: false, right: false, swing: false };
    p.x = 0;
    p.y = -10;
    p.swing = { t: 0, didHit: false, charge };
    const ball = world.ball;
    Object.assign(ball, {
      x: 0,
      y: -9,
      z: 0.8,
      px: 0,
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
  assert.deepEqual(world.stats.shots, { topspin: 1, slice: 1, lob: 1 });
});
