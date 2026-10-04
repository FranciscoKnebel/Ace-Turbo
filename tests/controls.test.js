import test from 'node:test';
import assert from 'node:assert/strict';
import { aimWorld, createWorld, stepWorld } from '../src/sim/world.js';

function moveFor(world, player, input, frames = 60) {
  const start = { x: player.x, y: player.y };
  world.inputs[player.id] = { up: false, down: false, left: false, right: false, swing: false, ...input };
  for (let i = 0; i < frames; i++) stepWorld(world, 1 / 120);
  return { dx: player.x - start.x, dy: player.y - start.y };
}

test('P1: setas relativas à tela (cima = em direção à rede, direita = +x)', () => {
  const world = createWorld({ mode: 'singles', seed: 1 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.a1;

  const up = moveFor(world, p, { up: true });
  assert.ok(up.dy > 0.3, `cima deveria ir para +y (dy=${up.dy.toFixed(2)})`);

  const right = moveFor(world, p, { right: true });
  assert.ok(right.dx > 0.3, `direita deveria ir para +x (dx=${right.dx.toFixed(2)})`);

  const down = moveFor(world, p, { down: true });
  assert.ok(down.dy < -0.3, `baixo deveria ir para -y (dy=${down.dy.toFixed(2)})`);

  const left = moveFor(world, p, { left: true });
  assert.ok(left.dx < -0.3, `esquerda deveria ir para -x (dx=${left.dx.toFixed(2)})`);
});

test('P2: mesmas direções de tela, sem inversão', () => {
  const world = createWorld({ mode: 'versus', seed: 1 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.b1;

  const up = moveFor(world, p, { up: true });
  assert.ok(up.dy > 0.3, `cima deveria ir para +y (dy=${up.dy.toFixed(2)})`);
  const right = moveFor(world, p, { right: true });
  assert.ok(right.dx > 0.3, `direita deveria ir para +x (dx=${right.dx.toFixed(2)})`);
});

test('mira do golpe: lateral segue a tela e profundidade é relativa ao próprio lado', () => {
  const singles = createWorld({ mode: 'singles', seed: 1 });
  const a1 = singles.byId.a1;
  a1.input = { up: true, down: false, left: false, right: true, swing: false };
  assert.deepEqual(aimWorld(a1), { x: 1, fwd: 1 }, 'P1: cima+direita = fundo+direita');

  const versus = createWorld({ mode: 'versus', seed: 1 });
  const b1 = versus.byId.b1;
  b1.input = { up: false, down: true, left: true, right: false, swing: false };
  assert.deepEqual(aimWorld(b1), { x: -1, fwd: 1 }, 'P2: baixo+esquerda = fundo+esquerda');
});

test('saque: mira lateral acompanha a tela', () => {
  const world = createWorld({ mode: 'singles', seed: 1 });
  const server = world.byId.a1;
  const before = { ...server.input };
  server.input = { up: false, down: false, left: false, right: true, swing: false };
  const aim = aimWorld(server);
  assert.equal(aim.x, 1, 'direita na tela = +x');
  server.input = before;
});
