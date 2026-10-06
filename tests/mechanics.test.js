import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardPoint,
  createWorld,
  executeRallyShot,
  executeServe,
  pickServer,
  startServeToss,
  stepWorld,
  tryHit,
} from '../src/sim/world.js';
import { blankInput } from '../src/sim/ai.js';
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

test('IA na recepção espera na baseline e não segue o toss', () => {
  const world = createWorld({ mode: 'demo', seed: 8 });
  const server = pickServer(world);
  const receiver = world.byId[world.serve.receiverId];
  const homeX = receiver.homeX;
  startServeToss(world, server, 0.75, 'flat');
  for (let i = 0; i < 90; i++) stepWorld(world, 1 / 120);
  assert.ok(
    Math.abs(receiver.x - homeX) < 1.2,
    `recebedor não deve correr para o meio (x=${receiver.x.toFixed(2)} vs home=${homeX.toFixed(2)})`,
  );
  assert.ok(
    Math.abs(receiver.y) > 9,
    `recebedor deve esperar fundo (y=${receiver.y.toFixed(2)})`,
  );
});

test('IA parceiro do sacador não persegue o toss', () => {
  const world = createWorld({ mode: 'demo', seed: 9 });
  const server = pickServer(world);
  const partner = world.players.find((p) => p.team === server.team && p.id !== server.id);
  const homeY = partner.homeY;
  startServeToss(world, server, 0.75, 'flat');
  for (let i = 0; i < 90; i++) stepWorld(world, 1 / 120);
  assert.ok(
    Math.abs(partner.y - homeY) < 1.5,
    `parceiro do sacador deve ficar na rede (y=${partner.y.toFixed(2)} vs home=${homeY.toFixed(2)})`,
  );
});

test('IA não carrega batida quando a bola não vai na direção dela', async () => {
  const { stepAI } = await import('../src/sim/ai.js');
  const world = createWorld({ mode: 'singles', seed: 12 });
  const ai = world.byId.b1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  ai.x = -4;
  ai.y = 10;
  // Bola cruzando para o outro canto: não dá para chegar.
  Object.assign(world.ball, {
    x: 4.5,
    y: 8,
    z: 1.0,
    vx: 2,
    vy: 6,
    vz: 0,
    bounces: [],
    curve: 0,
    heldBy: null,
    dead: false,
    lastHit: { team: 'a', player: 'a1', isServe: false },
  });
  for (let i = 0; i < 40; i++) stepAI(world, ai, 1 / 120);
  assert.equal(ai.input.swing, false, 'não deveria tentar carregar bola inalcançável');

  // Bola vindo na direção da IA: agora sim carrega.
  Object.assign(world.ball, {
    x: -4,
    y: 6,
    z: 1.0,
    vx: 0,
    vy: 7,
    vz: 0,
    bounces: [],
    curve: 0,
    lastHit: { team: 'a', player: 'a1', isServe: false },
  });
  ai.ai.lastHitKey = null;
  ai.ai.reactTimer = 0;
  ai.ai.decideTimer = 0;
  ai.ai.holding = false;
  ai.ai.pendingShot = null;
  for (let i = 0; i < 60; i++) stepAI(world, ai, 1 / 120);
  assert.equal(ai.input.swing, true, 'bola na direção da IA deveria carregar');
});

test('detecção de bola vindo em cima (usada para sair da frente)', async () => {
  const { isBallIncoming } = await import('../src/sim/ai.js');
  const player = { x: 0, y: 10 };
  const base = { x: 0, y: 8, z: 0.8, vx: 0, heldBy: null };
  assert.equal(isBallIncoming(player, { ...base, vy: 6 }), true, 'bola chegando = true');
  assert.equal(isBallIncoming(player, { ...base, vy: -6 }), false, 'bola se afastando = false');
  assert.equal(isBallIncoming(player, { ...base, vy: 6, z: 2.4 }), false, 'bola alta não conta');
  assert.equal(isBallIncoming(player, { ...base, vy: 6, heldBy: 'a1' }), false, 'bola na mão não conta');
});

test('claim em duplas com parceiros em lados opostos do ponto de contato', async () => {
  const { planIntercept } = await import('../src/sim/ai.js');
  const world = createWorld({ mode: 'demo', seed: 31 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.serve.returnPending = false;
  const a1 = world.byId.a1;
  const a2 = world.byId.a2;
  a1.x = -2.5;
  a1.y = -9;
  a2.x = 2.5;
  a2.y = -9;
  // Bola no meio e rápida: a1 "abre" para o forehand e a2 encaixa o backhand,
  // então os alvos personalizados ficam em lados opostos.
  Object.assign(world.ball, {
    x: 0,
    y: -4,
    z: 1.0,
    vx: 0,
    vy: -8,
    vz: 0,
    bounces: [],
    curve: 0,
    heldBy: null,
    dead: false,
    lastHit: { team: 'b', player: 'b1', isServe: false },
  });
  const p1 = planIntercept(world, a1, world.ball);
  const p2 = planIntercept(world, a2, world.ball);
  const claiming = [p1, p2].filter((p) => p.intercept).length;
  assert.equal(claiming, 1, `apenas um parceiro deveria perseguir (${claiming} interceptaram)`);
});

test('em duplas, só um parceiro persegue a mesma bola (claim pelo ponto comum)', async () => {
  const { planIntercept } = await import('../src/sim/ai.js');
  const world = createWorld({ mode: 'demo', seed: 30 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.serve.returnPending = false;
  const a1 = world.byId.a1;
  const a2 = world.byId.a2;
  a1.x = 2.5;
  a1.y = -9;
  a2.x = -2.5;
  a2.y = -9;
  // Bola indo na direção do a1.
  Object.assign(world.ball, {
    x: 2.0,
    y: -4,
    z: 1.0,
    vx: 0,
    vy: -6,
    vz: 0,
    bounces: [],
    curve: 0,
    heldBy: null,
    dead: false,
    lastHit: { team: 'b', player: 'b1', isServe: false },
  });
  const p1 = planIntercept(world, a1, world.ball);
  const p2 = planIntercept(world, a2, world.ball);
  const claiming = [p1, p2].filter((p) => p.intercept).length;
  assert.equal(claiming, 1, `apenas um parceiro deveria perseguir (${claiming} interceptaram)`);
  assert.ok(p1.intercept, 'o parceiro mais perto (a1) é quem persegue');
});

test('duplas: cada jogador mantém o lado da formação do saque no rally', async () => {
  const { homeSpot } = await import('../src/sim/ai.js');
  const world = createWorld({ mode: 'demo', seed: 31 });
  // Joga um ponto: o lado do saque espelha (como no tênis) e a formação passa a
  // colocar alguém no lado oposto ao preferido.
  world.phase = 'rally';
  awardPoint(world, 'a', 'PONTO');
  for (let i = 0; i < 120 * 4 && world.phase !== 'serve'; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'serve', 'novo saque');
  const crossed = world.players.find((p) => p.pointSide !== p.prefSide);
  assert.ok(crossed, 'deveria existir alguém no lado oposto ao preferido');
  for (const p of world.players) {
    assert.equal(Math.sign(p.x), p.pointSide, `${p.id} deveria estar no lado da formação`);
  }
  // No rally, com a bola no lado oposto, ele segura o lado da formação em vez
  // de cruzar para o lado preferido.
  world.phase = 'rally';
  world.serve.returnPending = false;
  Object.assign(world.ball, {
    x: -crossed.pointSide * 3,
    y: -8,
    z: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    heldBy: null,
    dead: false,
  });
  const home = homeSpot(world, crossed, world.ball);
  assert.equal(
    Math.sign(home.x),
    crossed.pointSide,
    `${crossed.id} não deveria cruzar para o lado preferido`,
  );
});

// Prepara uma bola real vinda do b1 na direção do fundo do a1.
function incomingShot(world, charge = 0.7) {
  const b1 = world.byId.b1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.serve.returnPending = false;
  b1.x = 0;
  b1.y = 9;
  b1.input = { ...blankInput(), down: true, swing: true, shot: 'flat' };
  b1.swing = { t: 0, didHit: false, charge, shot: 'flat' };
  const ball = world.ball;
  Object.assign(ball, {
    x: 0,
    y: 8.5,
    z: 0.9,
    px: 0,
    py: 8.5,
    vx: 0,
    vy: 0,
    vz: 0,
    bounces: [],
    heldBy: null,
    dead: false,
    lastHit: null,
  });
  executeRallyShot(world, b1, ball);
  return ball;
}

test('jogo de rede: quem está adiantado voleia antes do quique', async () => {
  const { planIntercept } = await import('../src/sim/ai.js');
  const { predictTrajectory } = await import('../src/sim/physics.js');
  const world = createWorld({ mode: 'singles', seed: 70 });
  const ball = incomingShot(world);
  const a1 = world.byId.a1;
  a1.x = 0;
  a1.y = -4.5; // adiantado, em posição de voleio
  const plan = planIntercept(world, a1, ball);
  assert.ok(plan.intercept, 'deveria interceptar a bola');
  const bounce = predictTrajectory(ball, { maxT: 4, step: 0.02, doubles: false }).bounces.find(
    (b) => b.y < 0,
  );
  assert.ok(bounce, 'a bola deveria quicar do lado do a1');
  assert.ok(
    plan.intercept.t < bounce.t,
    `o voleio deveria ser antes do quique (${plan.intercept.t.toFixed(2)} < ${bounce.t.toFixed(2)})`,
  );
});

test('jogo de rede: quem está no fundo espera o quique', async () => {
  const { planIntercept } = await import('../src/sim/ai.js');
  const { predictTrajectory } = await import('../src/sim/physics.js');
  const world = createWorld({ mode: 'singles', seed: 72 });
  const ball = incomingShot(world);
  const a1 = world.byId.a1;
  a1.x = 0;
  a1.y = -10; // no fundo
  const plan = planIntercept(world, a1, ball);
  assert.ok(plan.intercept, 'deveria interceptar a bola');
  const bounce = predictTrajectory(ball, { maxT: 4, step: 0.02, doubles: false }).bounces.find(
    (b) => b.y < 0,
  );
  assert.ok(
    plan.intercept.t >= bounce.t - 0.03,
    `no fundo deveria esperar o quique (${plan.intercept.t.toFixed(2)} vs ${bounce.t.toFixed(2)})`,
  );
});

test('jogo de rede: sacador em saque-e-voleio não volta ao fundo', async () => {
  const { homeSpot } = await import('../src/sim/ai.js');
  const world = createWorld({ mode: 'demo', seed: 71 });
  const server = pickServer(world);
  assert.ok(server.ai, 'a CPU tem ai');
  server.ai.approach = 1; // saque-e-voleio
  const up = homeSpot(world, server, world.ball);
  assert.ok(Math.abs(up.y) < 8, `deveria subir à rede (${up.y.toFixed(2)})`);
  server.ai.approach = 0;
  const back = homeSpot(world, server, world.ball);
  assert.ok(Math.abs(back.y) > 10, `sem approach deveria recuar (${back.y.toFixed(2)})`);
});

test('saque-e-voleio vale só para o saque decidido', () => {
  const world = createWorld({ mode: 'demo', seed: 5 });
  const server = pickServer(world);
  assert.ok(server.ai, 'a CPU tem ai');
  server.ai.approach = 1; // veio de um saque-e-voleio anterior
  world.serve.id += 1; // novo saque
  stepWorld(world, 1 / 120);
  assert.equal(server.ai.approach, 0, 'o novo saque zera o approach');
});

test('IA em duplas: parceiro do recebedor não persegue o saque', async () => {
  const { planIntercept } = await import('../src/sim/ai.js');
  const world = createWorld({ mode: 'coop', seed: 3 });
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  const receiver = world.byId[world.serve.receiverId];
  const partner = world.players.find((p) => p.team === receiver.team && p.id !== receiver.id);
  assert.equal(world.serve.returnPending, true, 'a devolução está pendente');

  // Bola de saque indo na direção do parceiro: mesmo assim ele não deve buscar.
  Object.assign(world.ball, {
    x: -2, // dentro da caixa de serviço
    y: partner.y - 5,
    z: 1.2,
    vx: 0,
    vy: 8,
    vz: 0,
    bounces: [],
    curve: 0,
    lastHit: { team: server.team, player: server.id, isServe: true },
  });
  const blocked = planIntercept(world, partner, world.ball);
  assert.equal(blocked.intercept, null, 'parceiro não deve ter interceptação');
  assert.equal(blocked.goingOut, false);

  // Depois da devolução (returnPending falso) ele volta a poder perseguir.
  world.serve.returnPending = false;
  const free = planIntercept(world, partner, world.ball);
  assert.ok(free.intercept, 'sem a restrição, o parceiro persegue normalmente');
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
  const { difficultyLabel, DIFFICULTY_ORDER } = await import('../src/render.js');
  assert.deepEqual(DIFFICULTY_ORDER, ['easy', 'normal', 'hard', 'unfair', 'impossible']);
  assert.equal(difficultyLabel(4), 'Impossível');
});

// Prepara um rally controlado: bola fora de alcance e input do jogador setado.
function rallySetup(seed, stamina) {
  const world = createWorld({ mode: 'singles', seed });
  const p = world.byId.a1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  Object.assign(world.ball, {
    heldBy: null,
    dead: false,
    x: 0,
    y: 10,
    z: 1,
    vx: 0,
    vy: 0,
    vz: 20,
    bounces: [],
  });
  p.stamina = stamina;
  return { world, p };
}

test('segurar a batida gasta vigor', () => {
  const { world, p } = rallySetup(8, 80);
  world.inputs.a1 = { ...blankInput(), swing: true };
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.ok(p.charging, 'deveria estar carregando');
  const expected = 80 - STAMINA.CHARGE_DRAIN;
  assert.ok(
    Math.abs(p.stamina - expected) < 2.5,
    `vigor ${p.stamina.toFixed(1)} (esperado ~${expected})`,
  );
});

test('cansado carrega mais devagar', () => {
  const chargeAfter = (stamina) => {
    const { world, p } = rallySetup(9, stamina);
    world.inputs.a1 = { ...blankInput(), swing: true };
    for (let i = 0; i < 30; i++) stepWorld(world, 1 / 120);
    return p.charge;
  };
  const fresh = chargeAfter(100);
  const tired = chargeAfter(10);
  assert.ok(
    fresh > tired * 1.3,
    `carga com vigor ${fresh.toFixed(2)} vs cansado ${tired.toFixed(2)}`,
  );
});

test('no fim de ponto há a recuperação da pausa e no rally a recarga normal', () => {
  const { world, p } = rallySetup(10, 40);
  world.phase = 'pointover';
  world.pauseDuration = 2.2;
  world.phaseTimer = 10;
  world.ball.dead = true;
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'pointover');
  const pauseGain = p.stamina - 40;
  assert.ok(pauseGain > 5, `a pausa deveria recuperar vigor (${pauseGain.toFixed(1)})`);
  assert.ok(pauseGain <= p.staminaMax * 0.25 + 0.5, 'a pausa recupera no máximo 25% da barra');
  const before = p.stamina;
  world.phase = 'rally';
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.ok(p.stamina > before + 5, `deveria recarregar no rally (${p.stamina.toFixed(1)})`);
});

test('pausa entre pontos recupera vigor conforme o stat (12% a 28%)', () => {
  const recover = (staminaStat) => {
    const stats = { power: 75, technique: 75, serve: 75, stamina: staminaStat };
    const world = createWorld({
      mode: 'singles',
      seed: 50,
      players: {
        a1: { classId: 'custom', stats },
        b1: { classId: 'custom', stats },
      },
    });
    // Mede o recebedor: o sacador do ponto recupera em dobro (teste separado).
    const p = world.byId.b1;
    p.stamina = 20;
    const max = p.staminaMax;
    world.phase = 'rally';
    awardPoint(world, 'a', 'PONTO');
    assert.equal(world.phase, 'pointover');
    // 2 s de uma pausa de 3 s: mede só a recuperação da pausa.
    world.pauseDuration = 3;
    world.phaseTimer = 3;
    for (let i = 0; i < 120 * 2; i++) stepWorld(world, 1 / 120);
    assert.equal(world.phase, 'pointover', 'ainda na pausa');
    return { gained: p.stamina - 20, max };
  };
  const k = (stat) => Math.max(0, Math.min(1, (stat - 50) / 49));
  const expectedFrac = (stat) => (0.12 + (0.28 - 0.12) * k(stat)) * (2 / 3);
  const low = recover(50);
  const mid = recover(75);
  const high = recover(99);
  assert.ok(
    Math.abs(low.gained / low.max - expectedFrac(50)) < 0.02,
    `vigor 50 deveria recuperar ~${(expectedFrac(50) * 100).toFixed(0)}% da barra (${((low.gained / low.max) * 100).toFixed(1)}%)`,
  );
  assert.ok(
    Math.abs(high.gained / high.max - expectedFrac(99)) < 0.02,
    `vigor 99 deveria recuperar ~${(expectedFrac(99) * 100).toFixed(0)}% da barra (${((high.gained / high.max) * 100).toFixed(1)}%)`,
  );
  assert.ok(mid.gained > low.gained && mid.gained < high.gained, 'o meio fica entre os extremos');
});

test('pausa entre pontos: o sacador recupera em dobro', () => {
  const stats = { power: 75, technique: 75, serve: 75, stamina: 75 };
  const world = createWorld({
    mode: 'singles',
    seed: 40,
    players: {
      a1: { classId: 'custom', stats },
      b1: { classId: 'custom', stats },
    },
  });
  const server = pickServer(world);
  const other = world.players.find((p) => p.id !== server.id);
  server.stamina = 20;
  other.stamina = 20;
  world.phase = 'rally';
  awardPoint(world, 'a', 'PONTO');
  assert.equal(world.phase, 'pointover');
  world.pauseDuration = 3;
  world.phaseTimer = 3;
  for (let i = 0; i < 120 * 2; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'pointover', 'ainda na pausa');
  const serverGain = server.stamina - 20;
  const otherGain = other.stamina - 20;
  assert.ok(otherGain > 1, `o outro também recupera (${otherGain.toFixed(1)})`);
  assert.ok(
    Math.abs(serverGain - otherGain * 2) < 0.5,
    `o sacador deveria recuperar em dobro (${serverGain.toFixed(1)} vs ${otherGain.toFixed(1)})`,
  );
});

test('a recuperação da pausa vale mesmo correndo (o sprint desconta em paralelo)', async () => {
  const { blankInput } = await import('../src/sim/ai.js');
  const run = (sprint) => {
    const world = createWorld({ mode: 'singles', seed: 51 });
    const p = world.byId.a1;
    p.stamina = 60;
    world.phase = 'pointover';
    world.pauseDuration = 2.2;
    world.phaseTimer = 10;
    world.ball.dead = true;
    world.inputs.a1 = { ...blankInput(), sprint, up: true };
    for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
    return { gained: p.stamina - 60, sprinting: p.sprinting };
  };
  const running = run(true);
  const walking = run(false);
  assert.ok(running.sprinting, 'deveria estar correndo');
  // Sem a recuperação da pausa, correr 1 s gastaria 26 de vigor.
  assert.ok(
    running.gained > -30,
    `correndo deveria recuperar algo além do gasto (${running.gained.toFixed(1)})`,
  );
  assert.ok(walking.gained > running.gained, 'parado recupera mais que correndo');
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
      if (!p.sprinting && world.phase === 'rally' && p.stamina > before) {
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
  const world = createWorld({ mode: 'versus', seed: 6 });
  const server = pickServer(world);
  server.stamina = 40;
  const before = server.stamina;
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'serve', 'ainda no saque (o sacador humano espera)');
  assert.equal(server.stamina, before, 'a recarga deve pausar durante o saque');
});
