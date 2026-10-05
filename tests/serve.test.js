import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld,
  executeServe,
  pickServer,
  serveAimTarget,
  startServeToss,
  stepWorld,
} from '../src/sim/world.js';
import { SERVE } from '../src/sim/constants.js';

// Mede um saque isolado: tempo até o quique, quique e altura máxima.
function serveShot(seed, shot) {
  const world = createWorld({ mode: 'singles', seed });
  const server = pickServer(world);
  // Bola na altura do toss (como no jogo), senão a folga de rede domina o voo.
  Object.assign(world.ball, { z: 2.4, vz: 0 });
  executeServe(world, server, 0.75, shot);
  const ball = world.ball;
  const speed0 = Math.hypot(ball.vx, ball.vy, ball.vz);
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
  return { world, ball, speed0, peak, firstBounceT, firstBounce };
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

test('saque em dois estágios: o toss sobe e a batida acontece no alto', () => {
  const world = createWorld({ mode: 'singles', seed: 2 });
  const server = pickServer(world);
  // Estágio 1: humano segura a tecla para carregar o toss e solta.
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    swing: true,
    shot: 'flat',
    aim: null,
  };
  world.inputs[server.id] = input;
  // Carga dentro da zona ideal (0,6 a 0,9): toss alto para bater no alto.
  for (let i = 0; i < 96; i++) stepWorld(world, 1 / 120);
  assert.ok(server.charge > 0.6, `carga do toss na zona ideal (${server.charge.toFixed(2)})`);
  input.swing = false;
  stepWorld(world, 1 / 120); // solta → lança
  assert.ok(world.serve.toss, 'deve iniciar o lançamento');
  assert.equal(world.serve.stage, 'hit');
  assert.ok(world.serve.toss.idealZ > 1.6, 'toss alto o bastante para bater no alto');
  const zAfterToss = world.ball.z;
  const idealZ = world.serve.toss.idealZ;
  // Estágio 2: segura de novo e solta quando a bola chega no alto.
  let maxZ = world.ball.z;
  let hitZ = null;
  input.swing = true;
  for (let i = 0; i < 240; i++) {
    stepWorld(world, 1 / 120);
    maxZ = Math.max(maxZ, world.ball.z);
    if (!world.serve.inFlight && world.ball.vz < 0 && world.ball.z <= idealZ) {
      input.swing = false; // solta na queda
    }
    if (world.serve.inFlight) {
      hitZ = world.ball.z;
      break;
    }
  }
  assert.ok(world.serve.inFlight, 'depois do toss a batida executa o saque');
  assert.ok(
    maxZ > zAfterToss + 0.4,
    `a bola deveria subir (${zAfterToss.toFixed(2)} → ${maxZ.toFixed(2)})`,
  );
  assert.ok(hitZ > 2.0, `a batida deveria acontecer bem no alto (z=${hitZ.toFixed(2)})`);
  assert.ok(world.serve.lastServe.heightFactor > 0.8, 'contato perto do ideal');
  assert.ok(world.serve.lastServe.contactVz <= 0, 'a batida acontece na queda');
  assert.ok(SERVE.TOSS_VZ_MAX > SERVE.TOSS_VZ_MIN, 'a carga controla a altura do toss');
});

test('toss: a carga define a altura e a qualidade (zona ideal)', () => {
  const low = createWorld({ mode: 'singles', seed: 3 });
  startServeToss(low, pickServer(low), 0.15, 'flat');
  assert.ok(low.serve.toss.quality < 0.5, `toss fraco deveria ser ruim (${low.serve.toss.quality})`);
  const high = createWorld({ mode: 'singles', seed: 3 });
  startServeToss(high, pickServer(high), 0.75, 'flat');
  assert.equal(high.serve.toss.quality, 1, 'zona ideal = qualidade 1');
  assert.ok(high.ball.vz > low.ball.vz + 1, 'carga maior lança mais alto');
  assert.ok(high.serve.toss.idealZ > low.serve.toss.idealZ, 'toss alto tem contato ideal mais alto');
  assert.equal(high.stats.tosses, 1);
  assert.equal(high.stats.tossQualitySum, 1);
});

test('toss: área vale 90%+ e a área interna (100%) cresce com o saque', async () => {
  const { tossQuality } = await import('../src/sim/world.js');
  assert.ok(tossQuality(0.4, 75) < 0.9, 'fora da área fica abaixo de 90%');
  assert.ok(Math.abs(tossQuality(0.6, 75) - 0.9) < 0.03, 'borda da área = ~90%');
  const mid = tossQuality(0.82, 75);
  assert.ok(mid >= 0.9 && mid < 1, `dentro da área vale 90%+ (${mid.toFixed(3)})`);
  assert.equal(tossQuality(0.75, 50), 1, 'centro = 100% com qualquer saque');
  assert.equal(tossQuality(0.75, 99), 1);
  assert.equal(tossQuality(0.82, 99), 1, 'saque alto tem área de 100% maior');
  assert.ok(tossQuality(0.82, 50) < 1, 'saque baixo tem área de 100% menor');
  assert.equal(tossQuality(0.84, 99), 1);
  assert.ok(tossQuality(0.84, 50) < 1);
});

test('recebedor não invade a caixa de serviço durante o saque', () => {
  const world = createWorld({ mode: 'versus', seed: 15 });
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  world.ball.dead = true; // congela a bola: só interessa o movimento
  const receiver = world.byId.b1;
  receiver.y = 7.5; // perto da linha de saque
  world.inputs.b1 = {
    up: false,
    down: true,
    left: false,
    right: false,
    swing: false,
    shot: 'flat',
    aim: null,
  };
  assert.ok(world.serve.inFlight, 'saque em voo');
  for (let i = 0; i < 40; i++) stepWorld(world, 1 / 120);
  assert.ok(
    receiver.y >= 6.4 - 1e-6,
    `recebedor deveria ficar atrás da linha de saque (y=${receiver.y.toFixed(2)})`,
  );
  // Depois do quique (bola em jogo) ele pode avançar normalmente.
  world.serve.inFlight = false;
  for (let i = 0; i < 60; i++) stepWorld(world, 1 / 120);
  assert.ok(receiver.y < 6.4, `depois do quique pode avançar (y=${receiver.y.toFixed(2)})`);
});

test('a mensagem TOSS PERFEITO é só da área de 100%', () => {
  const world = createWorld({ mode: 'singles', seed: 7 });
  startServeToss(world, pickServer(world), 0.82, 'flat');
  assert.ok(world.serve.toss.quality < 1, 'fora da área interna não é 100%');
  assert.ok(world.serve.toss.quality >= 0.9, 'mas segue na área de 90%+');
  assert.ok(
    !world.message.includes('PERFEITO'),
    `não deveria anunciar perfeito fora da área interna (${world.message})`,
  );
  const perfect = createWorld({ mode: 'singles', seed: 7 });
  startServeToss(perfect, pickServer(perfect), 0.75, 'flat');
  assert.equal(perfect.serve.toss.quality, 1);
  assert.ok(
    perfect.message.includes('PERFEITO'),
    `deveria anunciar perfeito no centro da área interna (${perfect.message})`,
  );
});

test('toss perdido (bola cai sem batida) vira falta', () => {
  const world = createWorld({ mode: 'singles', seed: 4 });
  startServeToss(world, pickServer(world), 0.75, 'flat');
  for (let i = 0; i < 300 && world.stats.faults === 0; i++) stepWorld(world, 1 / 120);
  assert.equal(world.stats.faults, 1, 'toss perdido conta falta');
  assert.equal(world.serve.attempt, 2, 'primeira falta vira 2º saque');
  assert.equal(world.serve.toss, null);
});

test('contato na queda é melhor que na subida (subida é punida)', () => {
  const serveAt = (z, vz) => {
    const world = createWorld({ mode: 'singles', seed: 6 });
    const server = pickServer(world);
    startServeToss(world, server, 0.75, 'flat');
    world.ball.z = z;
    world.ball.vz = vz;
    executeServe(world, server, 0.75, 'flat');
    return {
      speed: Math.hypot(world.ball.vx, world.ball.vy, world.ball.vz),
      last: world.serve.lastServe,
    };
  };
  const descent = serveAt(2.0, -2.4); // na queda, na altura ideal
  const rise = serveAt(2.0, 2.4); // na subida, mesma altura
  assert.ok(descent.last.contactFactor > 0.95, 'queda no ideal = contato quase perfeito');
  assert.ok(rise.last.contactFactor < 0.5, 'subida deveria ser punida');
  assert.ok(
    descent.last.quality > rise.last.quality + 0.2,
    `queda deveria ter qualidade maior (${descent.last.quality} vs ${rise.last.quality})`,
  );
  assert.ok(
    descent.speed > rise.speed * 1.05,
    `saque na queda deveria sair mais forte (${descent.speed.toFixed(1)} vs ${rise.speed.toFixed(1)})`,
  );
});

test('contato alto na queda melhora o saque; contato baixo piora', () => {
  const serveAt = (z) => {
    const world = createWorld({ mode: 'singles', seed: 6 });
    const server = pickServer(world);
    startServeToss(world, server, 0.75, 'flat');
    world.ball.z = z;
    world.ball.vz = -2.4; // sempre na queda
    executeServe(world, server, 0.75, 'flat');
    return {
      speed: Math.hypot(world.ball.vx, world.ball.vy, world.ball.vz),
      last: world.serve.lastServe,
    };
  };
  const high = serveAt(2.0); // perto do ideal (idealZ ~ 2,0)
  const low = serveAt(0.9);
  assert.ok(
    high.last.heightFactor > low.last.heightFactor + 0.5,
    `contato alto deveria ser melhor (${high.last.heightFactor} vs ${low.last.heightFactor})`,
  );
  assert.ok(
    high.speed > low.speed * 1.05,
    `saque no alto deveria sair mais forte (${high.speed.toFixed(1)} vs ${low.speed.toFixed(1)})`,
  );
  assert.ok(high.last.quality > low.last.quality + 0.2, 'qualidade geral melhor no contato alto');
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

test('tipos de saque têm comportamentos diferentes (lob virou power)', () => {
  const flat = serveShot(3, 'flat');
  const top = serveShot(3, 'topspin');
  const slice = serveShot(3, 'slice');
  const power = serveShot(3, 'lob'); // a tecla do lob vira o power

  assert.equal(flat.ball.bounceScale, 1);
  assert.equal(top.ball.bounceScale, 1.35);
  assert.equal(slice.ball.bounceScale, 0.5);
  assert.equal(power.ball.spin, 'power', 'a tecla do lob vira saque de força');
  assert.equal(power.ball.bounceScale, 0.9);

  assert.ok(
    flat.speed0 > slice.speed0 * 1.05,
    `flat deveria sair mais rápida (${flat.speed0.toFixed(1)} vs ${slice.speed0.toFixed(1)} m/s)`,
  );
  assert.ok(
    flat.speed0 > 18,
    `saque flat deveria ser forte (${flat.speed0.toFixed(1)} m/s)`,
  );
  assert.ok(
    power.speed0 > flat.speed0 * 1.03,
    `power deveria ser o mais forte (${power.speed0.toFixed(1)} vs ${flat.speed0.toFixed(1)})`,
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
  // O lob não existe no saque: a tecla vira power.
  assert.deepEqual(world.stats.serveTypes, { flat: 1, topspin: 1, slice: 1, power: 1 });
});
