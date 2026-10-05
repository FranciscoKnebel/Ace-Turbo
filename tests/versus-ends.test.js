import test from 'node:test';
import assert from 'node:assert/strict';
import { awardPoint, createWorld, pickServer, stepWorld } from '../src/sim/world.js';
import { createAI } from '../src/sim/ai.js';
import { DIFFICULTY, PLAYER } from '../src/sim/constants.js';

function winGame(world, team) {
  for (let i = 0; i < 4; i++) {
    world.phase = 'rally';
    awardPoint(world, team, 'TESTE');
  }
}

function advanceToNextServe(world) {
  for (let i = 0; i < 600 && world.phase !== 'serve'; i++) stepWorld(world, 1 / 120);
  assert.equal(world.phase, 'serve');
}

test('versus: troca de lado a cada game ímpar e o placar segue o jogador', () => {
  const world = createWorld({ mode: 'versus', seed: 1 });
  const p1 = world.byId.a1;
  const p2 = world.byId.b1;
  assert.equal(p1.team, 'a');
  assert.equal(p2.team, 'b');

  // Game 1: P1 (time A) vence e saca primeiro.
  assert.equal(pickServer(world).id, 'a1');
  winGame(world, 'a');
  assert.equal(world.score.gamesPlayed, 1);
  assert.equal(world.score.games.a, 1);
  advanceToNextServe(world);

  assert.equal(p1.team, 'b', 'P1 deve trocar para o lado B após o game ímpar');
  assert.equal(p2.team, 'a', 'P2 deve ir para o lado A');
  assert.equal(world.score.games[p1.team], 1, 'o game de P1 acompanha o jogador');
  assert.equal(world.score.games[p2.team], 0);
  assert.match(world.message, /TROCA DE LADO/);
  assert.equal(pickServer(world).id, 'b1', 'P2 saca o game 2');

  // Game 2: P2 (agora no lado A) vence; não deve trocar (game par).
  winGame(world, 'a');
  assert.equal(world.score.gamesPlayed, 2);
  advanceToNextServe(world);
  assert.equal(p1.team, 'b', 'após game par os lados continuam iguais');
  assert.equal(p2.team, 'a');
  assert.equal(world.score.games[p1.team], 1);
  assert.equal(world.score.games[p2.team], 1);

  // Game 3: P1 vence; troca de lado de novo (game ímpar).
  winGame(world, p1.team);
  assert.equal(world.score.gamesPlayed, 3);
  advanceToNextServe(world);
  assert.equal(p1.team, 'a', 'P1 volta ao lado A no game 3');
  assert.equal(p2.team, 'b');
  assert.equal(world.score.games[p1.team], 2);
  assert.equal(world.score.games[p2.team], 1);
});

test('versus: sets e saque continuam consistentes após várias trocas', () => {
  const world = createWorld({ mode: 'versus', seed: 3, bestOf: 1 });
  // Ambos são humanos; viram CPUs para a partida rodar sozinha.
  const d = DIFFICULTY.normal;
  for (const p of world.players) {
    p.human = false;
    p.ai = createAI({ skill: d.skill, speedMult: d.speedMult, reaction: d.reaction });
    p.maxSpeed = PLAYER.MAX_SPEED * d.speedMult;
  }
  let guard = 0;
  while (world.phase !== 'matchover' && guard < 120 * 3600) {
    stepWorld(world, 1 / 120);
    guard++;
  }
  assert.equal(world.phase, 'matchover');
  const winner = world.score.winner;
  assert.ok(winner);
  const winnerPlayer = world.players.find((p) => p.team === winner);
  assert.ok(winnerPlayer, 'o vencedor corresponde a um jogador');
  for (const set of world.score.sets) {
    const w = Math.max(set.a, set.b);
    const l = Math.min(set.a, set.b);
    assert.ok(w >= 6 && (w - l >= 2 || w === 7), `set inválido: ${JSON.stringify(set)}`);
  }
});

test('coop e simples não trocam de lado', () => {
  for (const mode of ['coop', 'singles']) {
    const world = createWorld({ mode, seed: 1 });
    const p = world.byId.a1;
    const teamBefore = p.team;
    winGame(world, 'a');
    advanceToNextServe(world);
    assert.equal(p.team, teamBefore, `${mode} não deve trocar de lado`);
  }
});
