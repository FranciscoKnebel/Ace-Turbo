import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createAI } from '../src/sim/ai.js';
import { DIFFICULTY } from '../src/sim/constants.js';

// Transforma jogadores humanos em CPUs (para partidas headless).
function makeAllCpu(world, difficulty = 'normal') {
  const d = DIFFICULTY[difficulty];
  for (const p of world.players) {
    if (p.human) {
      p.human = false;
      p.ai = createAI({ skill: d.skill, speedMult: d.speedMult, reaction: d.reaction });
      p.maxSpeed = 6.8 * d.speedMult;
    }
  }
}

function runMatch({ mode = 'demo', difficulty = 'normal', seed = 1, maxSimSeconds = 1800 }) {
  const world = createWorld({ mode, difficulty, seed });
  makeAllCpu(world, difficulty);
  const dt = 1 / 120;
  const maxSteps = Math.ceil(maxSimSeconds / dt);
  let steps = 0;
  while (world.phase !== 'matchover' && steps < maxSteps) {
    stepWorld(world, dt);
    steps++;
  }
  return { world, steps, seconds: steps * dt };
}

test('partida completa CPU vs CPU (duplas, normal) termina com placar válido', () => {
  const { world, seconds } = runMatch({ mode: 'demo', difficulty: 'normal', seed: 7 });
  assert.equal(world.phase, 'matchover', `não terminou em ${seconds.toFixed(0)}s simulados`);
  assert.ok(world.score.winner, 'deve haver vencedor');
  assert.equal(world.score.setsWon[world.score.winner], 2);
  assert.ok(world.score.sets.length >= 2 && world.score.sets.length <= 3);
  assert.ok(world.stats.serves >= 10, `poucos saques: ${world.stats.serves}`);
  assert.ok(world.stats.hits >= 30, `poucas rebatidas: ${world.stats.hits}`);
  console.log(
    `[demo normal seed=7] vencedor=${world.score.winner}`,
    `sets=${JSON.stringify(world.score.sets)}`,
    `saques=${world.stats.serves} rebatidas=${world.stats.hits}`,
    `aces=${world.stats.aces} duplas faltas=${world.stats.doubleFaults}`,
    `turbo=${world.stats.turboShots} tempo=${seconds.toFixed(0)}s`,
  );
});

test('partida completa CPU vs CPU (simples, fácil) também termina', () => {
  const { world } = runMatch({ mode: 'singles', difficulty: 'easy', seed: 3, maxSimSeconds: 2400 });
  assert.equal(world.phase, 'matchover');
  assert.equal(world.doubles, false);
});

test('partida coop (humanos viram CPU) roda em quadra de duplas e gira o saque', () => {
  const { world, seconds } = runMatch({ mode: 'coop', difficulty: 'easy', seed: 11, maxSimSeconds: 2400 });
  assert.equal(world.phase, 'matchover', `não terminou em ${seconds.toFixed(0)}s`);
  assert.equal(world.doubles, true);
  assert.ok(world.stats.points >= 8);
});

test('sets e games ficam consistentes com o vencedor', () => {
  const { world } = runMatch({ mode: 'demo', difficulty: 'hard', seed: 5 });
  const w = world.score.winner;
  const l = w === 'a' ? 'b' : 'a';
  assert.equal(world.score.setsWon[w], 2);
  assert.ok(world.score.setsWon[l] <= 1);
  for (const set of world.score.sets) {
    const winnerGames = Math.max(set.a, set.b);
    const loserGames = Math.min(set.a, set.b);
    assert.ok(winnerGames >= 6, `set inválido: ${JSON.stringify(set)}`);
    assert.ok(winnerGames - loserGames >= 2 || winnerGames === 7, `margem inválida: ${JSON.stringify(set)}`);
    assert.ok(loserGames <= 6);
  }
});
