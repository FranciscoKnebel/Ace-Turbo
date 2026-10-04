import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardPoint,
  createWorld,
  executeServe,
  pickServer,
  processBounce,
  registerFault,
  stepWorld,
  tryHit,
} from '../src/sim/world.js';
import { sideOf } from '../src/sim/ai.js';

function worldSingles(seed = 1) {
  return createWorld({ mode: 'singles', seed });
}

function pushBounce(world, x, y, inCourt) {
  world.ball.bounces.push({ x, y, inCourt });
  processBounce(world, { type: 'bounce', x, y, inCourt });
}

test('formação de saque em simples', () => {
  const world = worldSingles();
  const server = pickServer(world);
  assert.equal(server.id, 'a1');
  assert.equal(server.team, 'a');
  assert.ok(Math.abs(server.x - 1.6) < 1e-9, 'saque do lado direito (deuce)');
  assert.ok(Math.abs(server.y - (-(11.885 + 1.1))) < 1e-9, 'atrás da linha de fundo');
  const receiver = world.byId.b1;
  assert.ok(Math.abs(receiver.x - -2.8) < 1e-9, 'recebe na caixa diagonal');
  assert.ok(Math.abs(receiver.y - 11.285) < 1e-9, 'recepção funda, perto da linha de fundo');
  assert.ok(Math.abs(receiver.y) > 11, 'recebedor deve ficar atrás de 11 m');
});

test('saque válido coloca a bola em jogo', () => {
  const world = worldSingles();
  const server = pickServer(world);
  assert.equal(executeServe(world, server, 0.7), true);
  assert.equal(world.serve.inFlight, true);
  for (let i = 0; i < 600 && world.phase !== 'rally'; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'rally', `saque deveria ser válido (msg: ${world.message})`);
  assert.equal(world.serve.inFlight, false);
  assert.equal(world.stats.serves, 1);
});

test('saque fora da caixa é fault; segunda falta é dupla falta', () => {
  const world = worldSingles();
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  world.ball.touchedNet = false;
  processBounce(world, { type: 'bounce', x: 5.5, y: 4, inCourt: false });
  assert.equal(world.serve.attempt, 2, 'virou segundo saque');
  assert.match(world.message, /FAULT/);
  assert.equal(world.phase, 'serve');
  registerFault(world);
  assert.equal(world.stats.doubleFaults, 1);
  assert.equal(world.score.points.b, 1);
  assert.equal(world.phase, 'pointover');
});

test('let: saque que toca a rede e cai na caixa é repetido', () => {
  const world = worldSingles();
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  world.ball.touchedNet = true;
  pushBounce(world, -2, 4, true); // dentro da caixa correta
  assert.match(world.message, /LET/);
  assert.equal(world.serve.attempt, 1, 'let não consome a tentativa');
  assert.equal(world.phase, 'serve');
  assert.equal(world.ball.heldBy, server.id, 'bola volta para o sacador');
  assert.equal(world.stats.lets, 1);
});

test('saque que quica no próprio lado é fault', () => {
  const world = worldSingles();
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  pushBounce(world, 0, -3, true);
  assert.equal(world.serve.attempt, 2);
  assert.match(world.message, /FAULT/);
});

test('rally: dois quiques no lado adversário dão o ponto a quem bateu', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  pushBounce(world, 0, 5, true);
  assert.equal(world.phase, 'rally', 'primeiro quique mantém a jogada');
  pushBounce(world, 0.2, 5.5, true);
  assert.equal(world.score.points.a, 1);
  assert.equal(world.phase, 'pointover');
});

test('rally: bola fora dá ponto ao adversário de quem bateu', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  pushBounce(world, 0, 12.4, false);
  assert.equal(world.score.points.b, 1);
  assert.match(world.lastPoint.reason, /FORA/);
});

test('rally: net cord que cai dentro mantém a jogada', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  world.ball.touchedNet = true;
  pushBounce(world, 0, 5, true);
  assert.equal(world.phase, 'rally', 'bola na fita que cai dentro não para o ponto');
  assert.equal(world.score.points.a + world.score.points.b, 0);
});

test('rally: primeiro quique dentro e o segundo fora ainda é ponto de quem bateu', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  pushBounce(world, 0, 5, true); // quique válido
  pushBounce(world, 0, 12.4, false); // segundo quique, fora
  assert.equal(world.score.points.a, 1, 'quem recebeu não devolveu antes do 2º quique');
  assert.equal(world.phase, 'pointover');
});

test('rally: bola que cai no próprio lado dá ponto ao adversário', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  pushBounce(world, 0, -4, true);
  assert.equal(world.score.points.b, 1);
});

test('turnos: o mesmo time não pode bater duas vezes seguidas', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.a1;
  const ball = world.ball;
  Object.assign(ball, {
    x: 0,
    y: -5,
    z: 0.5,
    px: 0,
    py: -5,
    vx: 0,
    vy: 5,
    vz: 0,
    heldBy: null,
    dead: false,
    bounces: [],
    lastHit: { team: 'b', player: 'b1', isServe: false },
  });
  p.x = 0;
  p.y = -5.4;
  p.swing = { t: 0.08, didHit: false, charge: 0.5 };
  assert.equal(tryHit(world, p), true, 'devolve a bola do adversário');
  assert.equal(ball.lastHit.team, 'a');

  // Segunda tentativa do mesmo time sem o adversário bater: não pode.
  const mate = world.byId.b1;
  ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  const p2 = mate;
  p2.x = 0;
  p2.y = -5.4;
  p2.swing = { t: 0.08, didHit: false, charge: 0.5 };
  ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  assert.equal(tryHit(world, p2), false, 'time A não pode bater de novo');
});

test('turnos: bola do lado errado não pode ser batida', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.a1;
  const ball = world.ball;
  Object.assign(ball, {
    x: 0,
    y: 5,
    z: 0.5,
    px: 0,
    py: 5,
    heldBy: null,
    dead: false,
    lastHit: { team: 'b', player: 'b1', isServe: false },
  });
  p.x = 0;
  p.y = 5.4; // burlando o limite de quadra apenas para o teste
  p.swing = { t: 0.08, didHit: false, charge: 0.5 };
  assert.equal(tryHit(world, p), false);
});

test('duplas: rodízio de sacador dentro do time', () => {
  const world = createWorld({ mode: 'coop', seed: 1 });
  assert.equal(pickServer(world).id, 'a1');
  world.score.teamServeIndex.a = 1;
  assert.equal(pickServer(world).id, 'a2');
  assert.equal(world.doubles, true);
  // posições de dupla
  const receiver = world.byId.b1;
  const partner = world.byId.a2;
  assert.ok(Math.abs(receiver.x - -2.8) < 1e-9);
  assert.ok(Math.abs(partner.y - -3.8) < 1e-9, 'parceiro do sacador perto da rede');
});

test('ace é registrado quando o recebedor não toca na bola', () => {
  const world = worldSingles();
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  pushBounce(world, -2, 4, true); // saque bom
  assert.equal(world.phase, 'rally');
  pushBounce(world, -2.1, 5, true); // segundo quique
  assert.equal(world.stats.aces, 1);
  assert.equal(world.score.points.a, 1);
});

test('awardPoint não pontua duas vezes no mesmo ponto', () => {
  const world = worldSingles();
  world.phase = 'rally';
  awardPoint(world, 'a', 'TESTE');
  const after = world.score.points.a;
  awardPoint(world, 'a', 'TESTE');
  assert.equal(world.score.points.a, after);
});

test('fase pointover reinicia o saque depois do intervalo', () => {
  const world = worldSingles();
  for (let i = 0; i < 4; i++) {
    world.phase = 'rally'; // fluxo real: cada ponto parte de uma jogada
    awardPoint(world, 'a', 'TESTE');
  }
  assert.equal(world.phase, 'pointover');
  assert.equal(world.score.games.a, 1, 'quatro pontos fecham o game');
  for (let i = 0; i < 400; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'serve');
  assert.equal(pickServer(world).id, 'b1', 'saque passou para B');
  assert.ok(world.ball.heldBy, 'bola na mão do sacador');
});

test('2º saque: sacador volta à posição de saque mesmo tendo se movido', () => {
  const world = worldSingles();
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  // Enquanto o 1º saque está no ar, o sacador se move (ex.: perto da rede).
  server.x = 0.5;
  server.y = -3;
  world.ball.touchedNet = false;
  processBounce(world, { type: 'bounce', x: 5.5, y: 4, inCourt: false }); // falta
  assert.equal(world.serve.attempt, 2);
  assert.ok(
    Math.abs(server.y - -(11.885 + 1.1)) < 1e-6,
    `sacador deveria voltar ao fundo (y=${server.y})`,
  );
  assert.ok(Math.abs(server.x - 1.6) < 1e-6, `sacador deveria voltar ao lado de saque (x=${server.x})`);
  assert.equal(world.ball.heldBy, server.id, 'bola volta para a mão do sacador');
});

test('let: sacador também volta à posição de saque', () => {
  const world = worldSingles();
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  server.x = 1;
  server.y = -5;
  world.ball.touchedNet = true;
  pushBounce(world, -2, 4, true); // let
  assert.equal(world.serve.attempt, 1);
  assert.ok(Math.abs(server.y - -(11.885 + 1.1)) < 1e-6, 'sacador volta ao fundo após o let');
  assert.ok(Math.abs(server.x - 1.6) < 1e-6);
});

test('jogadores não cruzam a rede', () => {
  const world = worldSingles();
  const p = world.byId.a1;
  p.vy = 50;
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.ok(p.y <= -0.35 + 1e-6, `y=${p.y} deveria respeitar o limite da rede`);
  assert.ok(sideOf('a') < 0 && sideOf('b') > 0);
});
