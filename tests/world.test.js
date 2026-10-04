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
  // Quique fora decide na hora: não precisa esperar o segundo quique.
  pushBounce(world, 0, 12.4, false);
  assert.equal(world.score.points.b, 1);
  assert.match(world.lastPoint.reason, /FORA/);
});

test('rally: quique dentro não encerra (dá para buscar até o segundo quique)', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  pushBounce(world, 0, 11.4, true); // funda, mas dentro: jogada segue
  assert.equal(world.score.points.a + world.score.points.b, 0, 'quique dentro não decide');
  assert.equal(world.phase, 'rally');
  pushBounce(world, 0, 12.6, true);
  assert.equal(world.score.points.a, 1);
  assert.match(world.lastPoint.reason, /DUAS VEZES/);
});

test('rally: segundo quique dentro da quadra decide para quem bateu', () => {
  const world = worldSingles();
  world.phase = 'rally';
  world.serve.inFlight = false;
  world.ball.lastHit = { team: 'a', player: 'a1', isServe: false };
  pushBounce(world, 0, 8, true);
  assert.equal(world.score.points.a, 0);
  pushBounce(world, 0, 9, true);
  assert.equal(world.score.points.a, 1);
  assert.match(world.lastPoint.reason, /DUAS VEZES/);
  assert.equal(world.stats.winners, 1);
});

test('saque sem devolução vira ACE no aviso e nas estatísticas', () => {
  const world = worldSingles();
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  pushBounce(world, -2, 4, true); // saque válido na caixa
  assert.equal(world.phase, 'rally');
  assert.equal(world.stats.aces, 0);
  pushBounce(world, -2.5, 5, true); // segundo quique sem ninguém tocar
  assert.equal(world.score.points.a, 1);
  assert.equal(world.lastPoint.reason, 'ACE');
  assert.match(world.message, /ACE/);
  assert.equal(world.stats.aces, 1);
  assert.equal(world.setStats.aces, 1);
  assert.equal(world.stats.serves, 1);
  assert.equal(world.stats.firstServes, 1);
});

test('estatísticas por set: retrato no fim do set e total acumulado', () => {
  const world = worldSingles();
  for (let i = 0; i < 24; i++) {
    world.phase = 'rally';
    awardPoint(world, 'a', 'PONTO');
  }
  assert.equal(world.score.sets.length, 1, 'set encerrado');
  assert.equal(world.setHistory.length, 1);
  assert.equal(world.setSummary.points, 24);
  assert.equal(world.setHistory[0].points, 24);
  assert.equal(world.setHistory[0].winners, 24);
  assert.equal(world.stats.points, 24, 'total da partida');
  assert.equal(world.setStats.points, 0, 'set novo em branco');
  world.phase = 'rally';
  awardPoint(world, 'b', 'FORA');
  assert.equal(world.stats.points, 25);
  assert.equal(world.stats.errorsOut, 1);
  assert.equal(world.setStats.points, 1);
  assert.equal(world.setHistory[0].points, 24, 'retrato do set não muda');
});

test('resumo do set não reaparece nos pontos do set seguinte', () => {
  const world = createWorld({ mode: 'singles', seed: 2, bestOf: 3 });
  for (let i = 0; i < 24; i++) {
    world.phase = 'rally';
    awardPoint(world, 'a', 'PONTO');
  }
  assert.ok(world.setSummary, 'painel do set encerrado fica na pausa do fim do set');
  // Termina a pausa (SET_PAUSE = 3,4 s) até o jogo voltar.
  for (let i = 0; i < 120 * 4; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'serve', 'o set seguinte começa');
  assert.equal(world.setSummary, null, 'o resumo é limpo quando o jogo volta');
  // Um ponto comum do set seguinte não pode reabrir o painel do set anterior.
  world.phase = 'rally';
  awardPoint(world, 'b', 'FORA');
  assert.equal(world.phase, 'pointover');
  assert.equal(world.setSummary, null, 'pausa comum não mostra o set anterior');
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
  assert.ok(world.phaseTimer >= 3, `pausa de game deveria ser longa (${world.phaseTimer.toFixed(1)}s)`);
  for (let i = 0; i < 440; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'serve');
  assert.equal(pickServer(world).id, 'b1', 'saque passou para B');
  assert.ok(world.ball.heldBy, 'bola na mão do sacador');
});

test('durante a pausa do ponto a movimentação continua liberada', () => {
  const world = worldSingles();
  world.phase = 'rally';
  awardPoint(world, 'a', 'TESTE');
  assert.equal(world.phase, 'pointover');
  const p = world.byId.a1;
  const y0 = p.y;
  world.inputs.a1 = {
    up: true,
    down: false,
    left: false,
    right: false,
    swing: false,
    shot: 'flat',
    aim: null,
  };
  for (let i = 0; i < 90; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'pointover', 'ainda está na pausa');
  assert.ok(p.y > y0 + 0.3, `o jogador deveria andar na pausa (y=${p.y.toFixed(2)})`);
});

test('companheiros não ocupam o mesmo espaço (colisão entre jogadores)', () => {
  const world = createWorld({ mode: 'coop', seed: 1 });
  const [a1, a2] = world.players.filter((p) => p.team === 'a');
  a1.x = 0;
  a1.y = -6;
  a2.x = 0;
  a2.y = -6; // exatamente sobrepostos
  for (let i = 0; i < 30; i++) stepWorld(world, 1 / 120);
  const d = Math.hypot(a1.x - a2.x, a1.y - a2.y);
  assert.ok(d >= 0.8, `deveriam se separar (distância=${d.toFixed(2)})`);
});

test('bola que bate no parceiro perde o ponto na hora', () => {
  const world = createWorld({ mode: 'coop', seed: 2 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const [a1, a2] = world.players.filter((p) => p.team === 'a');
  const ball = world.ball;
  // a1 bateu e a bola vai em direção ao parceiro a2, antes de cruzar a rede.
  Object.assign(ball, {
    x: a2.x + 0.2,
    y: a2.y,
    z: 0.4,
    px: a2.x + 0.35,
    py: a2.y,
    vx: -10,
    vy: 0,
    vz: 0,
    heldBy: null,
    dead: false,
    bounces: [],
    touchedNet: false,
    crossed: false,
    lastHit: { team: 'a', player: 'a1', isServe: false },
  });
  stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'pointover');
  assert.equal(world.lastPoint.team, 'b', 'o ponto vai para o outro time');
  assert.match(world.lastPoint.reason, /PARCEIRO/);
});

test('bola que bate no adversário depois do quique dá o ponto a quem bateu', () => {
  const world = createWorld({ mode: 'singles', seed: 2 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const p = world.byId.b1;
  const ball = world.ball;
  Object.assign(ball, {
    x: p.x - 0.2,
    y: p.y,
    z: 0.4,
    px: p.x - 0.35,
    py: p.y,
    vx: 10,
    vy: 0,
    vz: 0,
    heldBy: null,
    dead: false,
    bounces: [{ x: p.x - 3, y: p.y, inCourt: true }],
    touchedNet: false,
    crossed: true,
    lastHit: { team: 'a', player: 'a1', isServe: false },
  });
  stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'pointover');
  assert.equal(world.lastPoint.team, 'a');
  assert.match(world.lastPoint.reason, /JOGADOR/);
});

test('toque no parceiro depois da bola cruzar não encerra o ponto', () => {
  const world = createWorld({ mode: 'coop', seed: 2 });
  world.phase = 'rally';
  world.serve.inFlight = false;
  const [, a2] = world.players.filter((p) => p.team === 'a');
  const ball = world.ball;
  Object.assign(ball, {
    x: a2.x + 0.2,
    y: a2.y,
    z: 0.4,
    px: a2.x + 0.35,
    py: a2.y,
    vx: 10,
    vy: 0,
    vz: 0,
    heldBy: null,
    dead: false,
    bounces: [],
    touchedNet: false,
    crossed: true,
    lastHit: { team: 'a', player: 'a1', isServe: false },
  });
  stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'rally', 'a bola já cruzou, então o toque não vale');
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

test('em duplas, a devolução do saque é sempre do recebedor designado', () => {
  const world = createWorld({ mode: 'coop', seed: 1 });
  const server = pickServer(world);
  executeServe(world, server, 0.7);
  const receiver = world.byId[world.serve.receiverId];
  const partner = world.players.find(
    (p) => p.team === receiver.team && p.id !== receiver.id,
  );
  assert.ok(receiver && partner, 'deve haver recebedor e parceiro');

  const ball = world.ball;
  const setup = (p) => {
    Object.assign(ball, {
      x: p.x,
      y: p.y,
      z: 0.5,
      px: p.x,
      py: p.y,
      heldBy: null,
      dead: false,
      bounces: [],
      lastHit: { team: server.team, player: server.id, isServe: true },
    });
    p.swing = { t: 0.08, didHit: false, charge: 0.5, shot: 'flat' };
  };

  setup(partner);
  assert.equal(tryHit(world, partner), false, 'o parceiro não pode roubar a devolução');
  setup(receiver);
  assert.equal(tryHit(world, receiver), true, 'o recebedor designado devolve o saque');
});

test('jogadores não cruzam a rede', () => {
  const world = worldSingles();
  const p = world.byId.a1;
  p.vy = 50;
  for (let i = 0; i < 120; i++) stepWorld(world, 1 / 120);
  assert.ok(p.y <= -0.35 + 1e-6, `y=${p.y} deveria respeitar o limite da rede`);
  assert.ok(sideOf('a') < 0 && sideOf('b') > 0);
});
