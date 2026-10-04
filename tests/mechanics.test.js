import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, executeServe, executeRallyShot, pickServer, stepWorld, tryHit } from '../src/sim/world.js';
import { CURVE, DIFFICULTY, STAMINA } from '../src/sim/constants.js';
import { stepBall } from '../src/sim/physics.js';

test('slice tem efeito lateral: a bola curva para fora', () => {
  const world = createWorld({ mode: 'singles', seed: 3 });
  const server = pickServer(world);
  executeServe(world, server, 0.75, 'slice');
  const ball = world.ball;
  assert.equal(ball.curve, CURVE.SLICE_SERVE, 'o saque slice deve ter curva');

  // Linha reta entre o início e o quique, comparada com a trajetória real.
  const x0 = ball.x;
  const y0 = ball.y;
  const events = [];
  let firstBounce = null;
  for (let i = 0; i < 120 * 4; i++) {
    stepBall(ball, 1 / 120, false, events);
    if (ball.bounces.length > 0) {
      firstBounce = { x: ball.bounces[0].x, y: ball.bounces[0].y, inCourt: ball.bounces[0].inCourt };
      break;
    }
  }
  assert.ok(firstBounce, 'o saque slice deve quicar');
  assert.ok(firstBounce.inCourt, `slice deveria cair na quadra (${JSON.stringify(firstBounce)})`);
  // O desvio lateral: a bola curva para fora (x mais negativo no lado A).
  const straightX = x0 + (firstBounce.x - x0) * 0.5;
  assert.ok(
    Math.abs(firstBounce.x) > Math.abs(straightX) + 0.2,
    `deveria curvar (x=${firstBounce.x.toFixed(2)} vs reta=${straightX.toFixed(2)})`,
  );
});

test('slice no rally também curva e cai na quadra', () => {
  const world = createWorld({ mode: 'singles', seed: 4 });
  const p = world.byId.a1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  p.input = { up: false, down: false, left: false, right: false, swing: true, shot: 'slice', sprint: false, aim: null };
  p.x = 0;
  p.y = -9;
  p.swing = { t: 0, didHit: false, charge: 0.7, shot: 'slice' };
  const ball = world.ball;
  Object.assign(ball, {
    x: 0, y: -8, z: 0.8, px: 0, py: -8, vx: 0, vy: 0, vz: 0,
    heldBy: null, dead: false, bounces: [], touchedNet: false, crossed: false,
    onGround: false, sinceBounce: 99, curve: 0,
    lastHit: { team: 'b', player: 'b1', isServe: false },
  });
  executeRallyShot(world, p, ball);
  assert.equal(ball.curve, CURVE.SLICE_SHOT);
  const events = [];
  for (let i = 0; i < 120 * 4; i++) {
    stepBall(ball, 1 / 120, false, events);
    if (ball.bounces.length > 0) break;
  }
  const bounce = ball.bounces[0];
  assert.ok(bounce && bounce.inCourt, `slice deveria cair na quadra (${JSON.stringify(bounce)})`);
});

test('devolução em duplas: parceiro não bate nem depois do quique do saque', () => {
  const world = createWorld({ mode: 'coop', seed: 3 });
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  const receiver = world.byId[world.serve.receiverId];
  const partner = world.players.find((p) => p.team === receiver.team && p.id !== receiver.id);
  // Simula o saque quicando na caixa (serve.inFlight vira false), mas sem devolução.
  world.serve.inFlight = false;
  world.phase = 'rally';
  const ball = world.ball;
  const setup = (p) => {
    Object.assign(ball, {
      x: p.x, y: p.y, z: 0.5, px: p.x, py: p.y,
      heldBy: null, dead: false, bounces: [{ x: p.x, y: p.y - 1, inCourt: true }],
      lastHit: { team: server.team, player: server.id, isServe: true },
    });
    p.swing = { t: 0.08, didHit: false, charge: 0.5, shot: 'flat' };
  };
  setup(partner);
  assert.equal(tryHit(world, partner), false, 'parceiro ainda não pode devolver');
  setup(receiver);
  assert.equal(tryHit(world, receiver), true, 'o recebedor devolve');
  assert.equal(world.serve.returnPending, false, 'depois da devolução libera');
});

test('dificuldades Injusto e Impossível ficam acima de Difícil', () => {
  assert.ok(DIFFICULTY.unfair, 'deve existir a dificuldade injusta');
  assert.ok(DIFFICULTY.unfair.speedMult > DIFFICULTY.hard.speedMult);
  assert.ok(DIFFICULTY.unfair.skill > DIFFICULTY.hard.skill);
  assert.ok(DIFFICULTY.unfair.reaction < DIFFICULTY.hard.reaction);
  assert.ok(DIFFICULTY.impossible, 'deve existir a dificuldade impossível');
  assert.ok(DIFFICULTY.impossible.speedMult > DIFFICULTY.unfair.speedMult);
  assert.ok(DIFFICULTY.impossible.skill > DIFFICULTY.unfair.skill);
  assert.ok(DIFFICULTY.impossible.reaction < DIFFICULTY.unfair.reaction);
});

test('menu oferece as cinco dificuldades, incluindo Impossível', async () => {
  const { DIFFICULTY_LABEL, DIFFICULTY_ORDER } = await import('../src/render.js');
  assert.deepEqual(DIFFICULTY_ORDER, ['easy', 'normal', 'hard', 'unfair', 'impossible']);
  assert.equal(DIFFICULTY_LABEL.impossible, 'Impossível');
});

test('IA usa o sprint durante a partida e recarrega mais devagar', () => {
  const world = createWorld({ mode: 'demo', seed: 5, difficulty: 'normal', bestOf: 1 });
  const aiPlayers = world.players.filter((p) => !p.human);
  const prev = new Map(aiPlayers.map((p) => [p.id, p.stamina]));
  let sprinted = false;
  let maxRegenStep = 0;
  let steps = 0;
  while (world.phase !== 'matchover' && steps < 120 * 3200) {
    stepWorld(world, 1 / 120);
    steps++;
    for (const p of aiPlayers) {
      if (p.sprinting) sprinted = true;
      const before = prev.get(p.id);
      if (!p.sprinting && world.phase !== 'serve' && p.stamina > before) {
        maxRegenStep = Math.max(maxRegenStep, p.stamina - before);
      }
      prev.set(p.id, p.stamina);
    }
  }
  assert.ok(sprinted, 'alguma IA deveria ter corrido (sprint)');
  assert.ok(maxRegenStep > 0, 'a IA deveria recarregar em algum momento');
  const humanStep = STAMINA.REGEN / 120;
  assert.ok(
    maxRegenStep < humanStep * 0.8,
    `a IA deveria recarregar mais devagar (${maxRegenStep.toFixed(4)} vs humano ${humanStep.toFixed(4)} por frame)`,
  );
});

test('recarga de vigor pausa durante o saque', () => {
  const world = createWorld({ mode: 'singles', seed: 6 });
  const server = pickServer(world);
  server.stamina = 40;
  const before = server.stamina;
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'serve', 'ainda no saque (IA espera para sacar)');
  assert.equal(server.stamina, before, 'a recarga deve pausar durante o saque');
});
