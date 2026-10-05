import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld,
  executeServe,
  pickServer,
  serveAimTarget,
  stepWorld,
} from '../src/sim/world.js';
import { SERVE } from '../src/sim/constants.js';

// Mede um saque isolado: tempo até o quique, quique e altura máxima.
function serveShot(seed, shot) {
  const world = createWorld({ mode: 'singles', seed });
  const server = pickServer(world);
  executeServe(world, server, 0.75, shot);
  const ball = world.ball;
  let peak = 0;
  let firstBounceT = null;
  let firstBounce = null;
  let t = 0;
  const dt = 1 / 120;
  const events = [];
  for (let i = 0; i < 120 * 6; i++) {
    const before = ball.bounces.length;
    // só a física da bola (sem jogadores) para medir a trajetória
    stepWorld(world, dt);
    t += dt;
    if (ball.bounces.length === 0) peak = Math.max(peak, ball.z);
    if (ball.bounces.length > before && firstBounceT === null) {
      firstBounceT = t;
      firstBounce = { ...ball.bounces[0] };
    }
    if (firstBounceT !== null || world.phase !== 'serve') break;
  }
  return { world, ball, peak, firstBounceT, firstBounce };
}

test('recepção de saque fica mais funda (perto da linha de fundo)', () => {
  for (const mode of ['singles', 'coop']) {
    const world = createWorld({ mode, seed: 1 });
    const server = pickServer(world);
    const receivers = world.players.filter((p) => p.team !== server.team);
    const receiver = receivers.find((p) => p.prefSide === -world.score.serveSideSign(server.team));
    assert.ok(receiver, 'deve existir o recebedor');
    assert.ok(
      Math.abs(receiver.y) >= 11,
      `${mode}: recebedor deveria estar fundo (y=${receiver.y.toFixed(2)})`,
    );
  }
});

test('saque tem lançamento: a bola sobe e é batida no alto', () => {
  const world = createWorld({ mode: 'singles', seed: 2 });
  const server = pickServer(world);
  // Humano segura a tecla para carregar e solta (dispara o lançamento).
  world.inputs[server.id] = {
    up: false,
    down: false,
    left: false,
    right: false,
    swing: true,
    shot: 'flat',
    aim: null,
  };
  for (let i = 0; i < 60; i++) stepWorld(world, 1 / 120);
  assert.ok(server.charge > 0.4, 'carga acumulada');
  world.inputs[server.id].swing = false;
  stepWorld(world, 1 / 120); // solta → lança
  assert.ok(world.serve.toss, 'deve iniciar o lançamento');
  const zAfterToss = world.ball.z;
  let maxZ = world.ball.z;
  let hitZ = null;
  for (let i = 0; i < 120; i++) {
    stepWorld(world, 1 / 120);
    maxZ = Math.max(maxZ, world.ball.z);
    if (world.serve.inFlight && hitZ === null) hitZ = world.ball.z;
    if (world.serve.inFlight) break;
  }
  assert.ok(world.serve.inFlight, 'depois do lançamento o saque é executado');
  assert.ok(maxZ > zAfterToss + 0.4, `a bola deveria subir (${zAfterToss.toFixed(2)} → ${maxZ.toFixed(2)})`);
  assert.ok(hitZ > 2.0, `a batida deveria acontecer bem no alto (z=${hitZ.toFixed(2)})`);
  assert.ok(maxZ > 2.2, `o lançamento deveria ser alto (z máx=${maxZ.toFixed(2)})`);
  assert.ok(SERVE.TOSS_TIME > 0.2, 'deve haver tempo de preparação');
});

test('saque tem controle de direção: a mira cobre a caixa', () => {
  const world = createWorld({ mode: 'singles', seed: 8 });
  const server = pickServer(world);
  const aimAt = (dir) => {
    server.input = {
      up: dir === 'up',
      down: dir === 'down',
      left: dir === 'left',
      right: dir === 'right',
      swing: false,
      shot: 'flat',
      aim: null,
    };
    return serveAimTarget(world, server, 'flat');
  };

  const right = aimAt('right');
  const left = aimAt('left');
  const deep = aimAt('down');
  const short = aimAt('up');

  // A quadra de A serve para x negativo (lado esquerdo do mundo).
  assert.ok(right.x > left.x, `direita deveria mirar mais à direita (${right.x.toFixed(2)} vs ${left.x.toFixed(2)})`);
  assert.ok(left.x < -3.2, `mira à esquerda deveria chegar perto da lateral (x=${left.x.toFixed(2)})`);
  assert.ok(right.x > -0.8, `mira à direita deveria chegar perto da linha central (x=${right.x.toFixed(2)})`);
  assert.ok(
    Math.abs(deep.y) > Math.abs(short.y) + 2,
    `fundo deveria ser bem mais profundo (${deep.y.toFixed(2)} vs ${short.y.toFixed(2)})`,
  );
  assert.ok(Math.abs(deep.y) > 5, `mira funda deveria passar de 5 m (y=${deep.y.toFixed(2)})`);
  assert.ok(Math.abs(short.y) < 3, `mira curta deveria ficar perto da rede (y=${short.y.toFixed(2)})`);
});

test('tipos de saque têm comportamentos diferentes', () => {
  const flat = serveShot(3, 'flat');
  const top = serveShot(3, 'topspin');
  const slice = serveShot(3, 'slice');
  const lob = serveShot(3, 'lob');

  assert.equal(flat.ball.bounceScale, 1);
  assert.equal(top.ball.bounceScale, 1.35);
  assert.equal(slice.ball.bounceScale, 0.5);

  assert.ok(
    slice.firstBounceT > flat.firstBounceT,
    `slice deveria ser mais lenta (${slice.firstBounceT.toFixed(2)}s vs ${flat.firstBounceT.toFixed(2)}s)`,
  );
  assert.ok(
    lob.peak > flat.peak * 1.4,
    `lob deveria subir bem mais (${lob.peak.toFixed(2)} vs ${flat.peak.toFixed(2)})`,
  );
  assert.ok(
    top.peak > flat.peak,
    `kick (top spin) deveria subir mais que a flat (${top.peak.toFixed(2)} vs ${flat.peak.toFixed(2)})`,
  );
});

test('estatísticas contam os tipos de saque', () => {
  const world = createWorld({ mode: 'singles', seed: 4 });
  const server = pickServer(world);
  for (const shot of ['flat', 'topspin', 'slice', 'lob']) {
    world.serve.inFlight = false;
    executeServe(world, server, 0.7, shot);
    world.serve.inFlight = false; // permite medir o próximo tipo
  }
  assert.deepEqual(world.stats.serveTypes, { flat: 1, topspin: 1, slice: 1, lob: 1 });
});
