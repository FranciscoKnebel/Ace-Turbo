import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBall, predictTrajectory, stepBall, isInCourt } from '../src/sim/physics.js';
import { COURT, PHYS } from '../src/sim/constants.js';
import { courtOutDistance, boxOutDistance } from '../src/sim/geometry.js';
import { pointInBox } from '../src/sim/math.js';
test('previsão acompanha rede, fita, curva, vento e superfícies sem alterar a bola', () => {
  for (const surface of ['hard', 'clay', 'grass']) for (const z of [0.5, 0.92, 2]) {
    const ball = Object.assign(makeBall(), { surface, y: -0.3, z, vy: 12, vz: 0, curve: 2, wind: { x: 0.5, y: 0.2 } });
    const original = structuredClone(ball);
    const predicted = predictTrajectory(ball, { maxT: 0.3, step: 1 / 120 });
    const actual = structuredClone(ball);
    for (const s of predicted.samples) { stepBall(actual, 1 / 120, false, []); assert.ok(Math.abs(actual.y - s.y) < 1e-10); assert.ok(Math.abs(actual.z - s.z) < 1e-10); }
    assert.deepEqual(ball, original);
  }
});
test('previsão mantém horizonte de 4,5 s com amostras a cada 20 ms', () => {
  const ball = Object.assign(makeBall(), { z: 20, vz: 12 });
  const p = predictTrajectory(ball, { maxT: 4.5, step: 0.02 });
  assert.ok(p.samples.length > 100); assert.ok(Math.abs(p.samples.at(-1).t - 4.5) < 1e-8);
  assert.throws(() => predictTrajectory(ball, { dt: 0 }), RangeError);
});
test('geometria compartilhada usa contato radial nos cantos e tolerância do saque', () => {
  const x = COURT.SINGLES_HALF_WIDTH + PHYS.BALL_RADIUS * 0.8;
  const y = COURT.HALF_LENGTH + PHYS.BALL_RADIUS * 0.8;
  assert.equal(isInCourt(x, y, false), false); assert.ok(courtOutDistance(x, y, false) > 0);
  const box = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  for (const x of [-0.031, -0.03, 0, 1.03, 1.031]) assert.equal(pointInBox(x, 0, box), boxOutDistance(x, 0, box) === 0);
});
