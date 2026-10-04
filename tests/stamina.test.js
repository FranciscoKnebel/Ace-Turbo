import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { DIFFICULTY, STAMINA } from '../src/sim/constants.js';

function moveInput(dir, sprint) {
  return {
    up: dir === 'up',
    down: dir === 'down',
    left: dir === 'left',
    right: dir === 'right',
    swing: false,
    shot: 'flat',
    sprint,
    aim: null,
  };
}

test('vigor: Shift corre mais rápido e gasta a barra; parado recarrega', () => {
  const world = createWorld({ mode: 'singles', seed: 1 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.a1;

  // Sem correr: velocidade normal e vigor cheio.
  world.inputs.a1 = moveInput('up', false);
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  const normalSpeed = Math.hypot(p.vx, p.vy);
  assert.ok(p.stamina > 99, `vigor deveria estar cheio (${p.stamina.toFixed(0)})`);

  // Correndo: mais rápido e gastando vigor.
  world.inputs.a1 = moveInput('up', true);
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  const sprintSpeed = Math.hypot(p.vx, p.vy);
  assert.ok(
    sprintSpeed > normalSpeed * 1.2,
    `correndo deveria ser mais rápido (${sprintSpeed.toFixed(2)} vs ${normalSpeed.toFixed(2)})`,
  );
  assert.ok(p.stamina < 80, `deveria gastar vigor (${p.stamina.toFixed(0)})`);
  assert.ok(p.sprinting, 'deveria estar correndo');

  // Parado: recarrega.
  const before = p.stamina;
  world.inputs.a1 = moveInput('up', false);
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.ok(p.stamina > before + 10, `deveria recarregar (${p.stamina.toFixed(0)} > ${before.toFixed(0)})`);
  assert.ok(!p.sprinting);
});

test('vigor: sem barra não corre; precisa soltar o Shift para voltar', () => {
  const world = createWorld({ mode: 'singles', seed: 2 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.a1;
  p.stamina = 0;
  p.exhausted = true;
  world.inputs.a1 = moveInput('up', true);
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.ok(p.stamina > 10, `a barra deveria recarregar (${p.stamina.toFixed(0)})`);
  assert.ok(!p.sprinting, 'não deve correr esgotado, mesmo segurando Shift');

  // Solta o Shift, recarrega e volta a correr.
  world.inputs.a1 = moveInput('up', false);
  for (let i = 0; i < 60; i++) stepWorld(world, 1 / 120);
  world.inputs.a1 = moveInput('up', true);
  for (let i = 0; i < 60; i++) stepWorld(world, 1 / 120);
  assert.ok(p.sprinting, 'depois de soltar e recarregar, corre de novo');
});

test('IA mais justa: velocidade das dificuldades perto da humana', () => {
  assert.ok(DIFFICULTY.easy.speedMult >= 0.7, 'fácil não pode ser lenta demais');
  assert.ok(DIFFICULTY.normal.speedMult >= 0.8, 'normal deve ser competitiva');
  assert.ok(DIFFICULTY.hard.speedMult >= 0.95, 'difícil deve ter velocidade humana');
});
