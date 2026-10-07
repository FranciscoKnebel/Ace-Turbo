import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, PHYS } from '../src/sim/constants.js';
import { isInCourt, makeBall, predictTrajectory, stepBall } from '../src/sim/physics.js';
import { solveBallistic } from '../src/sim/math.js';

function collect(ball, seconds, doubles = false) {
  const events = [];
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) stepBall(ball, dt, doubles, events);
  return events;
}

test('a previsão de trajetória considera o bounceScale (quique do topspin/slice)', () => {
  const make = (bounceScale) => {
    const ball = makeBall();
    Object.assign(ball, {
      x: 0,
      y: -6,
      z: 1.2,
      vx: 0,
      vy: 6,
      vz: 0,
      px: 0,
      py: -6,
      heldBy: null,
      bounceScale,
    });
    const pred = predictTrajectory(ball, { maxT: 3, step: 0.02, doubles: false });
    const first = pred.bounces[0];
    const after = pred.samples.filter((s) => s.t > first.t);
    const peak = after.length ? Math.max(...after.map((s) => s.z)) : 0;
    return { first, peak };
  };
  const flat = make(1);
  const top = make(1.3);
  const slice = make(0.5);
  assert.ok(top.peak > flat.peak * 1.15, `topspin deveria prever quique mais alto (${top.peak.toFixed(2)} vs ${flat.peak.toFixed(2)})`);
  assert.ok(slice.peak < flat.peak * 0.8, `slice deveria prever quique mais baixo (${slice.peak.toFixed(2)} vs ${flat.peak.toFixed(2)})`);
});

test('superfícies mudam o quique: saibro alto e lento, grama baixo e rápido', () => {
  const bounceApex = (surface) => {
    const ball = makeBall();
    Object.assign(ball, {
      x: 0,
      y: -6,
      z: 1.2,
      vx: 0,
      vy: 6,
      vz: 0,
      px: 0,
      py: -6,
      heldBy: null,
      surface,
    });
    const events = [];
    let bounced = false;
    let apex = 0;
    let speedAfter = 0;
    for (let i = 0; i < 120 * 3; i++) {
      stepBall(ball, 1 / 120, false, events);
      if (ball.bounces.length > 0) {
        if (!bounced) {
          bounced = true;
          speedAfter = Math.hypot(ball.vx, ball.vy);
        }
        apex = Math.max(apex, ball.z);
      }
    }
    return { apex, speedAfter };
  };
  const hard = bounceApex('hard');
  const clay = bounceApex('clay');
  const grass = bounceApex('grass');
  assert.ok(
    clay.apex > hard.apex * 1.1,
    `saibro deveria quicar mais alto (${clay.apex.toFixed(2)} vs ${hard.apex.toFixed(2)})`,
  );
  assert.ok(
    grass.apex < hard.apex * 0.95,
    `grama deveria quicar mais baixo (${grass.apex.toFixed(2)} vs ${hard.apex.toFixed(2)})`,
  );
  assert.ok(
    clay.speedAfter < hard.speedAfter,
    `saibro deveria frear mais (${clay.speedAfter.toFixed(2)} vs ${hard.speedAfter.toFixed(2)})`,
  );
  assert.ok(
    grass.speedAfter > hard.speedAfter,
    `grama deveria manter mais velocidade (${grass.speedAfter.toFixed(2)} vs ${hard.speedAfter.toFixed(2)})`,
  );
});

test('a previsão considera a superfície (igual à física real)', () => {
  const predictedApex = (surface) => {
    const ball = makeBall();
    Object.assign(ball, {
      x: 0,
      y: -6,
      z: 1.2,
      vx: 0,
      vy: 6,
      vz: 0,
      px: 0,
      py: -6,
      heldBy: null,
      surface,
    });
    const pred = predictTrajectory(ball, { maxT: 3, step: 0.02, doubles: false });
    const first = pred.bounces[0];
    const after = pred.samples.filter((s) => s.t > first.t);
    return after.length ? Math.max(...after.map((s) => s.z)) : 0;
  };
  const hard = predictedApex('hard');
  const clay = predictedApex('clay');
  assert.ok(clay > hard * 1.1, `previsão no saibro deveria ser mais alta (${clay.toFixed(2)} vs ${hard.toFixed(2)})`);
});

test('o vento acelera a bola na direção sorteada (e a previsão acompanha)', () => {
  const fly = (wind) => {
    const ball = makeBall();
    Object.assign(ball, {
      x: 0,
      y: -6,
      z: 1.2,
      vx: 0,
      vy: 6,
      vz: 0,
      px: 0,
      py: -6,
      heldBy: null,
      wind,
    });
    const events = [];
    for (let i = 0; i < 120; i++) stepBall(ball, 1 / 120, false, events);
    return ball;
  };
  const calm = fly(null);
  const windy = fly({ x: 0, y: 1.2, strength: 1.2 });
  assert.ok(
    windy.y > calm.y + 0.2,
    `o vento a favor deveria adiantar a bola (${windy.y.toFixed(2)} vs ${calm.y.toFixed(2)})`,
  );
  assert.ok(
    windy.vy > calm.vy,
    `o vento deveria acelerar a velocidade (${windy.vy.toFixed(2)} vs ${calm.vy.toFixed(2)})`,
  );
  // A previsão com o mesmo vento chega perto da física real.
  const ball = makeBall();
  Object.assign(ball, {
    x: 0,
    y: -6,
    z: 1.2,
    vx: 0,
    vy: 6,
    vz: 0,
    px: 0,
    py: -6,
    heldBy: null,
    wind: { x: 0, y: 1.2, strength: 1.2 },
  });
  const pred = predictTrajectory(ball, { maxT: 1, step: 0.05, doubles: false });
  const last = pred.samples[pred.samples.length - 1];
  const real = fly({ x: 0, y: 1.2, strength: 1.2 });
  assert.ok(
    Math.abs(real.y - last.y) < 0.35,
    `previsão e física deveriam bater (${last.y.toFixed(2)} vs ${real.y.toFixed(2)})`,
  );
});

test('solução balística acerta o alvo no primeiro quique (com arrasto)', () => {
  const ball = makeBall();
  Object.assign(ball, { x: 0, y: -12, z: 0.9, vx: 0, vy: 0, vz: 0, px: 0, py: -12, heldBy: null });
  const v = solveBallistic(
    { x: 0, y: -12, z: 0.9 },
    { x: 0, y: 5, z: 0.04 },
    0.8,
    PHYS.GRAVITY,
    PHYS.AIR_DRAG,
  );
  Object.assign(ball, v);
  const events = collect(ball, 3);
  const bounce = events.find((e) => e.type === 'bounce');
  assert.ok(bounce, 'deve quicar');
  assert.ok(Math.abs(bounce.y - 5) < 0.25, `quique em y=${bounce.y}, esperado ~5`);
  assert.ok(Math.abs(bounce.x) < 0.1);
});

test('quique perde energia (restitution)', () => {
  const ball = makeBall();
  Object.assign(ball, { x: 0, y: 0, z: 3, vx: 0, vy: 0, vz: 0 });
  const events = [];
  const dt = 1 / 120;
  let maxZ = 0;
  let bounced = false;
  for (let t = 0; t < 3; t += dt) {
    stepBall(ball, dt, false, events);
    if (ball.z > maxZ) maxZ = ball.z;
    if (!bounced && events.some((e) => e.type === 'bounce')) {
      bounced = true;
      events.length = 0;
      maxZ = 0;
    }
  }
  assert.ok(bounced, 'deve quicar');
  assert.ok(maxZ < 3 * PHYS.BOUNCE_RESTITUTION + 0.2, `altura pós-quique = ${maxZ}`);
  assert.ok(
    maxZ > 1.2,
    `quique deveria ser alto (soltando de 3 m, subiu ${maxZ.toFixed(2)} m)`,
  );
});

test('bola baixa bate na rede e volta para o lado de quem bateu', () => {
  const ball = makeBall();
  Object.assign(ball, { x: 0, y: -3, z: 0.5, vx: 0, vy: 12, vz: 0 });
  const events = collect(ball, 1.2);
  assert.ok(events.some((e) => e.type === 'net'), 'deve emitir evento de rede');
  assert.equal(ball.touchedNet, true);
  assert.ok(ball.y < 0, `deve voltar ao lado A (y=${ball.y})`);
});

test('bola que raspa a fita passa fraca para o outro lado', () => {
  const ball = makeBall();
  Object.assign(ball, { x: 0, y: -1, z: 0.88, vx: 0, vy: 12, vz: 0 });
  const events = collect(ball, 0.6);
  assert.ok(events.some((e) => e.type === 'net'), 'deve tocar a fita');
  assert.equal(ball.touchedNet, true);
  assert.ok(ball.y > 0, `deve continuar para o outro lado (y=${ball.y})`);
  assert.ok(Math.hypot(ball.vx, ball.vy) < 12, 'sai mais fraca');
});

test('bola alta passa por cima da rede', () => {
  const ball = makeBall();
  Object.assign(ball, { x: 0, y: -3, z: 2.5, vx: 0, vy: 12, vz: -0.5 });
  const events = collect(ball, 0.6);
  assert.ok(events.some((e) => e.type === 'cross'), 'deve cruzar a rede');
  assert.equal(ball.touchedNet, false);
  assert.ok(ball.y > 0);
});

test('rede é mais baixa no centro e mais alta nos postes', () => {
  assert.ok(COURT.NET_HEIGHT_CENTER < COURT.NET_HEIGHT_POST);
});

test('a bola que toca a linha está dentro (o raio conta)', () => {
  const line = 11.885;
  assert.equal(isInCourt(0, line, false), true, 'centro na linha');
  assert.equal(isInCourt(0, line + 0.05, false), true, 'bordo ainda na linha');
  assert.equal(isInCourt(0, line + 0.08, false), false, 'além do raio');
  assert.equal(isInCourt(4.115 + 0.04, 0, false), true, 'lateral com o bordo na linha');
});

test('linhas e limites da quadra', () => {
  assert.equal(isInCourt(0, 11.885, false), true);
  assert.equal(isInCourt(0, 12.0, false), false);
  assert.equal(isInCourt(4.0, 0, false), true);
  assert.equal(isInCourt(4.5, 0, false), false);
  assert.equal(isInCourt(4.5, 0, true), true);
  assert.equal(isInCourt(5.6, 0, true), false);
});

test('bola além da cerca morre com evento de fence', () => {
  const ball = makeBall();
  Object.assign(ball, { x: 0, y: -13, z: 0.5, vx: 0, vy: -20, vz: 0 });
  const events = collect(ball, 1);
  assert.ok(events.some((e) => e.type === 'fence'));
  assert.equal(ball.dead, true);
});
