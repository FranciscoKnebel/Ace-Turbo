import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';

// Jogador "humano" roteirizado: usa exatamente o caminho dos inputs humanos
// (world.inputs), validando o controle que o cliente web envia.
function scriptedHuman(world) {
  const p = world.byId.a1;
  const ball = world.ball;
  const input = { up: false, down: false, left: false, right: false, swing: false };
  const state = (world.__script ??= { holding: false });

  const myServe =
    world.phase === 'serve' && world.serve.serverId === p.id && !world.serve.inFlight;
  if (myServe) {
    // segura ~0,7 s, solta, espera e repete
    const cycle = (world.__serveCycle = (world.__serveCycle ?? 0) + 1);
    input.swing = cycle % 180 < 100;
    return input;
  }

  const dx = ball.x - p.x;
  const dy = ball.y - p.y;
  const d = Math.hypot(dx, dy);
  const closing = -(ball.vx * dx + ball.vy * dy) / Math.max(0.2, d);
  const ballOnMySide = ball.y < 0;

  if (ballOnMySide && !ball.heldBy) {
    if (Math.abs(dx) > 0.12) {
      input.right = dx > 0;
      input.left = dx < 0;
    }
    if (Math.abs(dy) > 0.12) {
      input.up = dy > 0;
      input.down = dy < 0;
    }
    if (!state.holding && d < 2.4 && (closing > 0 || ball.onGround)) state.holding = true;
  }
  if (state.holding && (world.phase === 'rally' || world.serve.inFlight)) {
    if (ballOnMySide && d < 1.0 && (closing > 0 || ball.onGround)) {
      state.holding = false;
      input.swing = false;
    } else if (closing < -1.5 || ball.y > 1) {
      state.holding = false;
      input.swing = false;
    } else {
      input.swing = true;
    }
  }
  return input;
}

test('jogador humano roteirizado joga uma partida completa (saque, rally e pontos)', () => {
  const world = createWorld({ mode: 'singles', difficulty: 'normal', seed: 21, bestOf: 1 });
  const dt = 1 / 120;
  const maxSteps = 120 * 3600;
  let steps = 0;
  while (world.phase !== 'matchover' && steps < maxSteps) {
    world.inputs.a1 = scriptedHuman(world);
    stepWorld(world, dt);
    steps++;
  }
  assert.equal(world.phase, 'matchover', `não terminou em ${(steps * dt).toFixed(0)}s`);
  const humanPoints = world.score.history.filter((h) => h.team === 'a').length;
  assert.ok(world.stats.serves > 6, `poucos saques executados pelo humano/CPU: ${world.stats.serves}`);
  assert.ok(humanPoints >= 1, 'o humano deveria vencer pelo menos um ponto');
  console.log(
    `[humano roteirizado] vencedor=${world.score.winner}`,
    `sets=${JSON.stringify(world.score.sets)}`,
    `pontos do humano=${humanPoints} rebatidas=${world.stats.hits}`,
  );
});
