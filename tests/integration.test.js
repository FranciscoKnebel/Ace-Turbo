import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createAI } from '../src/sim/ai.js';
import { DIFFICULTY, PLAYER } from '../src/sim/constants.js';

// Transforma jogadores humanos em CPUs (para partidas headless).
function makeAllCpu(world, difficulty = 'normal') {
  const d = DIFFICULTY[difficulty];
  for (const p of world.players) {
    if (p.human) {
      p.human = false;
      p.ai = createAI({ skill: d.skill, speedMult: d.speedMult, reaction: d.reaction });
      p.maxSpeed = PLAYER.MAX_SPEED * d.speedMult;
    }
  }
}

function runMatch({
  mode = 'demo',
  difficulty = 'normal',
  seed = 1,
  bestOf = 1,
  maxSimSeconds = 1800,
}) {
  const world = createWorld({ mode, difficulty, seed, bestOf });
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
  assert.equal(world.score.setsWon[world.score.winner], 1);
  assert.equal(world.score.sets.length, 1);
  assert.ok(world.stats.serves >= 8, `poucos saques: ${world.stats.serves}`);
  assert.ok(world.stats.hits >= 20, `poucas rebatidas: ${world.stats.hits}`);
  console.log(
    `[demo normal seed=7] vencedor=${world.score.winner}`,
    `sets=${JSON.stringify(world.score.sets)}`,
    `saques=${world.stats.serves} rebatidas=${world.stats.hits}`,
    `aces=${world.stats.aces} duplas faltas=${world.stats.doubleFaults}`,
    `turbo=${world.stats.turboShots} tempo=${seconds.toFixed(0)}s`,
  );
});

test('melhor de 3 sets também termina', () => {
  const { world, seconds } = runMatch({
    mode: 'demo',
    difficulty: 'normal',
    seed: 7,
    bestOf: 3,
    maxSimSeconds: 3600,
  });
  assert.equal(world.phase, 'matchover', `não terminou em ${seconds.toFixed(0)}s`);
  assert.equal(world.score.setsWon[world.score.winner], 2);
  assert.ok(world.score.sets.length >= 2 && world.score.sets.length <= 3);
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
  const { world, seconds } = runMatch({ mode: 'demo', difficulty: 'normal', seed: 5, maxSimSeconds: 2400 });
  assert.equal(world.phase, 'matchover', `não terminou em ${seconds.toFixed(0)}s`);
  const w = world.score.winner;
  assert.equal(world.score.setsWon[w], 1);
  for (const set of world.score.sets) {
    const winnerGames = Math.max(set.a, set.b);
    const loserGames = Math.min(set.a, set.b);
    assert.ok(winnerGames >= 6, `set inválido: ${JSON.stringify(set)}`);
    assert.ok(winnerGames - loserGames >= 2 || winnerGames === 7, `margem inválida: ${JSON.stringify(set)}`);
    assert.ok(loserGames <= 6);
  }
});

test('múltiplas sementes terminam sem travar e com rally', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { world, seconds } = runMatch({ mode: 'demo', difficulty: 'normal', seed, maxSimSeconds: 2400 });
    assert.equal(world.phase, 'matchover', `seed=${seed} não terminou (${seconds.toFixed(0)}s)`);
    assert.ok(world.score.winner, `seed=${seed} sem vencedor`);
    assert.ok(world.stats.hits >= 10, `seed=${seed} poucas rebatidas: ${world.stats.hits}`);
    assert.ok(
      world.stats.aces + world.stats.doubleFaults < world.stats.points,
      `seed=${seed} jogos decididos só por saque`,
    );
  }
});

test('turbo acontece em partidas de CPU', () => {
  const { world } = runMatch({ mode: 'demo', difficulty: 'hard', seed: 9, maxSimSeconds: 2400 });
  assert.ok(world.stats.turboShots > 0, 'esperava golpes turbo');
});

test('IA usa top spin, slice e lob em partidas reais', () => {
  const { world } = runMatch({ mode: 'demo', difficulty: 'hard', seed: 9, maxSimSeconds: 2400 });
  assert.ok(world.stats.shots.topspin > 0, 'top spin');
  assert.ok(world.stats.shots.slice > 0, `slice (${world.stats.shots.slice})`);
  assert.ok(world.stats.shots.lob > 0, `lob (${world.stats.shots.lob})`);
  assert.ok(world.stats.shots.flat > 0, `flat (${world.stats.shots.flat})`);
  assert.ok(
    world.stats.hands.forehand > 0 && world.stats.hands.backhand > 0,
    `forehand/backhand (${JSON.stringify(world.stats.hands)})`,
  );
  console.log(
    `[tipos de batida] topspin=${world.stats.shots.topspin} slice=${world.stats.shots.slice} lob=${world.stats.shots.lob} flat=${world.stats.shots.flat} mãos=${JSON.stringify(world.stats.hands)}`,
  );
});

test('fault, let e dupla falta acontecem em partidas reais', () => {
  let faults = 0;
  let lets = 0;
  let doubleFaults = 0;
  for (const seed of [1, 2, 3]) {
    const world = createWorld({ mode: 'demo', difficulty: 'easy', seed });
    let steps = 0;
    let prev = 1;
    let prevServes = 0;
    while (world.phase !== 'matchover' && steps < 120 * 2400) {
      stepWorld(world, 1 / 120);
      if (world.stats.serves !== prevServes) {
        prevServes = world.stats.serves;
        prev = world.serve.attempt;
      }
      if (world.serve.attempt === 2 && prev === 1) {
        faults++;
        prev = 2;
      }
      if (world.serve.attempt === 1 && prev === 2) prev = 1;
      steps++;
    }
    lets += world.stats.lets;
    doubleFaults += world.stats.doubleFaults;
  }
  assert.ok(faults > 0, `esperava faltas de primeiro saque (${faults})`);
  assert.ok(lets > 0, `esperava lets (${lets})`);
  assert.ok(doubleFaults > 0, `esperava duplas faltas (${doubleFaults})`);
  console.log(`[regras de saque] faults=${faults} lets=${lets} duplas faltas=${doubleFaults}`);
});
