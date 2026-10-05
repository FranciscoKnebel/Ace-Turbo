import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, pickServer, stepWorld } from '../src/sim/world.js';
import { blankInput } from '../src/sim/ai.js';
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

test('vigor: correr cansa mais que andar rápido; parado recarrega', () => {
  const world = createWorld({ mode: 'singles', seed: 1 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.a1;

  // Andando em velocidade máxima (sem Shift): cansa pouco.
  world.inputs.a1 = moveInput('up', false);
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  const normalSpeed = Math.hypot(p.vx, p.vy);
  const afterWalk = p.stamina;
  assert.ok(afterWalk < 100, `andar rápido também cansa (${afterWalk.toFixed(0)})`);
  assert.ok(afterWalk > 90, `andar cansa pouco (${afterWalk.toFixed(0)})`);

  // Correndo: mais rápido e gastando bem mais vigor.
  world.inputs.a1 = moveInput('up', true);
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  const sprintSpeed = Math.hypot(p.vx, p.vy);
  assert.ok(
    sprintSpeed > normalSpeed * 1.2,
    `correndo deveria ser mais rápido (${sprintSpeed.toFixed(2)} vs ${normalSpeed.toFixed(2)})`,
  );
  assert.ok(
    p.stamina < afterWalk - 15,
    `correr deveria gastar bem mais (${p.stamina.toFixed(0)} vs ${afterWalk.toFixed(0)})`,
  );
  assert.ok(p.sprinting, 'deveria estar correndo');

  // Parado: recarrega.
  const before = p.stamina;
  world.inputs.a1 = moveInput('none', false);
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.ok(p.stamina > before + 5, `deveria recarregar (${p.stamina.toFixed(0)} > ${before.toFixed(0)})`);
  assert.ok(!p.sprinting);
});

test('vigor: sem barra não corre e só recupera em ritmo lento', () => {
  const world = createWorld({ mode: 'singles', seed: 2 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.a1;
  p.stamina = 0;
  p.exhausted = true;
  world.inputs.a1 = moveInput('up', true);
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.ok(p.stamina < 1, `correndo não deveria recarregar (${p.stamina.toFixed(1)})`);
  assert.ok(!p.sprinting, 'não deve correr esgotado, mesmo segurando Shift');

  // Parado (e soltando o Shift), a barra volta e o sprint é liberado.
  world.inputs.a1 = moveInput('none', false);
  for (let i = 0; i < 120 * 2; i++) stepWorld(world, 1 / 120);
  assert.ok(p.stamina > 12, `parado deveria recarregar (${p.stamina.toFixed(0)})`);
  world.inputs.a1 = moveInput('up', true);
  for (let i = 0; i < 60; i++) stepWorld(world, 1 / 120);
  assert.ok(p.sprinting, 'depois de recarregar parado, corre de novo');
});

test('vigor: carregar só custa até a carga encher', () => {
  const world = createWorld({ mode: 'singles', seed: 3 });
  const p = world.byId.a1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  p.stamina = 100;
  world.inputs.a1 = { ...blankInput(), swing: true };
  for (let i = 0; i < 126; i++) stepWorld(world, 1 / 120); // 1 s: enche a carga
  const afterFull = p.stamina;
  assert.ok(p.charge >= 1, 'a carga deveria estar cheia');
  assert.ok(
    afterFull > 100 - STAMINA.CHARGE_DRAIN - 2,
    `carregar 1 s custa ~${STAMINA.CHARGE_DRAIN} (${afterFull.toFixed(1)})`,
  );
  for (let i = 0; i < 120 * 2; i++) stepWorld(world, 1 / 120); // segura mais 2 s
  assert.ok(
    Math.abs(p.stamina - afterFull) < 0.5,
    `segurar depois de cheia não gasta (${afterFull.toFixed(1)} -> ${p.stamina.toFixed(1)})`,
  );
});

test('vigor: carregar o saque custa bem menos que carregar no rally', () => {
  // Saque: o sacador carrega o toss por 0,6 s.
  const serveWorld = createWorld({ mode: 'versus', seed: 4 });
  const server = pickServer(serveWorld);
  assert.equal(serveWorld.phase, 'serve');
  server.stamina = 100;
  serveWorld.inputs[server.id] = { ...blankInput(), swing: true };
  for (let i = 0; i < 72; i++) stepWorld(serveWorld, 1 / 120);
  assert.ok(server.charging, 'deveria estar carregando o toss');
  const serveCost = 100 - server.stamina;

  // Rally: o mesmo tempo de carga custa o valor cheio.
  const rallyWorld = createWorld({ mode: 'versus', seed: 4 });
  const player = rallyWorld.players.find((p) => p.id === server.id) ?? rallyWorld.players[0];
  rallyWorld.phase = 'rally';
  rallyWorld.serve.inFlight = false;
  player.stamina = 100;
  rallyWorld.inputs[player.id] = { ...blankInput(), swing: true };
  for (let i = 0; i < 72; i++) stepWorld(rallyWorld, 1 / 120);
  const rallyCost = 100 - player.stamina;

  assert.ok(serveCost > 0, 'o saque gasta algo de vigor');
  assert.ok(
    serveCost < rallyCost * 0.5,
    `a carga do saque deveria custar bem menos (${serveCost.toFixed(2)} vs ${rallyCost.toFixed(2)})`,
  );
});

test('vigor: batida custa vigor, com extra quando esticado', () => {
  const hitCost = (dist) => {
    const world = createWorld({ mode: 'singles', seed: 11 });
    const p = world.byId.a1;
    world.phase = 'rally';
    world.serve.inFlight = false;
    p.x = 0;
    p.y = -10;
    p.vx = 0;
    p.vy = 0;
    p.stamina = 100;
    const ball = world.ball;
    Object.assign(ball, {
      x: dist,
      y: -10,
      z: 0.9,
      px: dist,
      py: -10,
      pz: 0.9,
      vx: 0,
      vy: 0,
      vz: 0,
      heldBy: null,
      dead: false,
      bounces: [],
      lastHit: { team: 'b', player: 'b1', isServe: false },
    });
    p.swing = { t: 0, didHit: false, charge: 0.6, shot: 'flat' };
    for (let i = 0; i < 60 && !p.swing?.didHit; i++) stepWorld(world, 1 / 120);
    assert.ok(p.swing?.didHit, 'deveria acertar a bola');
    return 100 - p.stamina;
  };
  const close = hitCost(0.3);
  const stretched = hitCost(1.1);
  assert.ok(
    Math.abs(close - STAMINA.HIT_COST) < 0.6,
    `batida perto deveria custar ~${STAMINA.HIT_COST} (${close.toFixed(2)})`,
  );
  assert.ok(
    Math.abs(stretched - (STAMINA.HIT_COST + STAMINA.HIT_COST_STRETCH)) < 0.6,
    `batida esticada deveria custar mais (${stretched.toFixed(2)})`,
  );
});

test('vigor: cansaço gradual reduz velocidade e ritmo de carga', () => {
  const chargeRate = (stamina) => {
    const world = createWorld({ mode: 'singles', seed: 12 });
    const p = world.byId.a1;
    world.phase = 'rally';
    world.serve.inFlight = false;
    p.stamina = stamina;
    world.inputs.a1 = { ...blankInput(), swing: true };
    for (let i = 0; i < 30; i++) stepWorld(world, 1 / 120);
    return p.charge;
  };
  const fresh = chargeRate(100);
  const mid = chargeRate(40);
  const low = chargeRate(5);
  assert.ok(
    fresh > mid && mid > low,
    `carga gradual (${fresh.toFixed(3)} > ${mid.toFixed(3)} > ${low.toFixed(3)})`,
  );
  assert.ok(
    fresh > low * 1.4,
    `barra vazia carrega bem mais devagar (${fresh.toFixed(3)} vs ${low.toFixed(3)})`,
  );

  const runSpeed = (stamina) => {
    const world = createWorld({ mode: 'singles', seed: 13 });
    const p = world.byId.a1;
    world.phase = 'rally';
    world.serve.inFlight = false;
    p.stamina = stamina;
    world.inputs.a1 = moveInput('up', false);
    for (let i = 0; i < 60; i++) stepWorld(world, 1 / 120);
    return Math.hypot(p.vx, p.vy);
  };
  const full = runSpeed(100);
  const half = runSpeed(45);
  const empty = runSpeed(8);
  assert.ok(
    full > half && half > empty,
    `velocidade gradual (${full.toFixed(2)} > ${half.toFixed(2)} > ${empty.toFixed(2)})`,
  );
  assert.ok(
    empty < full * 0.9,
    `barra vazia corre bem mais devagar (${empty.toFixed(2)} vs ${full.toFixed(2)})`,
  );
});

test('IA mais justa: velocidade das dificuldades perto da humana', () => {
  assert.ok(DIFFICULTY.easy.speedMult >= 0.7, 'fácil não pode ser lenta demais');
  assert.ok(DIFFICULTY.normal.speedMult >= 0.8, 'normal deve ser competitiva');
  assert.ok(DIFFICULTY.hard.speedMult >= 0.95, 'difícil deve ter velocidade humana');
});
