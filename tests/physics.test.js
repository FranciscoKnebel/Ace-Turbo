import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, PHYS } from '../src/sim/constants.js';
import { isInCourt, makeBall, stepBall } from '../src/sim/physics.js';
import { solveBallistic } from '../src/sim/math.js';

function collect(ball, seconds, doubles = false) {
  const events = [];
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) stepBall(ball, dt, doubles, events);
  return events;
}

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
