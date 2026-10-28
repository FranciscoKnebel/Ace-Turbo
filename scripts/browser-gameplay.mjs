import assert from 'node:assert/strict';
import { runBrowserSuite } from './lib/browser-harness.mjs';

async function hold(game, key, seconds) {
  await game.page.keyboard.down(key); await game.step(seconds);
  await game.page.keyboard.up(key); await game.step(.025);
}
async function serve(game, player) {
  const key = player === 'a1' ? 'Space' : 'Enter';
  await hold(game, key, .55);
  assert.equal(await game.page.evaluate(() => !!testClient.getState().world.serve.toss), true, 'First release must launch toss');
  await hold(game, key, .7);
}
async function returnBall(game, player, limit = 20) {
  const keys = player === 'a1' ? ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'] : ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
  const held = new Set(); let charging = false;
  try {
    for (let n = 0; n < limit * 20; n++) {
      const state = await game.page.evaluate(id => {
        const w = testClient.getState().world, p = w.byId[id], b = w.ball;
        return { phase: w.phase, ownSide: Math.sign(b.y) === (p.side === 'a' ? -1 : 1), held: !!b.heldBy,
          dx: b.x - p.x, dy: b.y - p.y, z: b.z, vx: b.vx, vy: b.vy, ground: b.onGround };
      }, player);
      if (state.phase === 'pointover') break;
      const { dx, dy } = state, distance = Math.hypot(dx, dy), closing = -(state.vx * dx + state.vy * dy) / Math.max(.2, distance);
      const desired = new Set();
      if (state.ownSide && !state.held) {
        if (Math.abs(dy) > .12) desired.add(keys[dy > 0 ? 0 : 1]);
        if (Math.abs(dx) > .12) desired.add(keys[dx < 0 ? 2 : 3]);
        if (!charging && distance < 2.4 && (closing > 0 || state.ground)) charging = true;
      }
      if (charging && ((state.ownSide && distance < 1 && (closing > 0 || state.ground)) || closing < -1.5 || !state.ownSide)) charging = false;
      if (charging) desired.add(keys[4]);
      for (const key of held) if (!desired.has(key)) { await game.page.keyboard.up(key); held.delete(key); }
      for (const key of desired) if (!held.has(key)) { await game.page.keyboard.down(key); held.add(key); }
      await game.step(.05);
    }
  } finally { for (const key of held) await game.page.keyboard.up(key); await game.step(.05); }
}

await runBrowserSuite('gameplay', {
  async humanKeyboard({ open }) {
    const game = await open(); await game.start('versus');
    for (let n = 0; n < 20; n++) {
      const state = await game.page.evaluate(() => {
        const w = testClient.getState().world; return { phase: w.phase, server: w.serve.serverId, hits: browserTest.events.filter(e => e.type === 'hit').map(e => e.player) };
      });
      if (['a1', 'b1'].every(id => state.hits.includes(id))) break;
      if (state.phase === 'serve') { await serve(game, state.server); await returnBall(game, state.server === 'a1' ? 'b1' : 'a1'); }
      await game.step(6);
    }
    const trace = await game.page.evaluate(() => ({ seed: testClient.getState().world.seed, stats: testClient.getState().world.stats,
      events: browserTest.events.filter(e => ['toss', 'serve', 'swing', 'hit', 'point'].includes(e.type)) }));
    for (const player of ['a1', 'b1']) {
      assert.ok(trace.events.some(e => e.type === 'serve' && e.player === player), `${player}: real keyboard serve`);
      assert.ok(trace.events.some(e => e.type === 'hit' && e.player === player), `${player}: real keyboard contact`);
    }
    assert.ok(trace.stats.points > 0); assert.equal(trace.stats.points, trace.events.filter(e => e.type === 'point').length);
    await game.finish(); return trace;
  },
  async completeDemo({ open }) {
    // Thousands of accelerated frames validate the full match on Canvas 2D.
    // WebGL is exercised separately over bounded real frames in graphics.
    const game = await open({ renderer: '2d' });
    // Mute by the native UI action before the accelerated simulation.
    await game.page.locator('summary').click({ force: true });
    await game.page.locator('[data-action="mute"]').click({ force: true });
    await game.page.locator('summary').click({ force: true });
    await game.page.locator('#game').focus(); await game.start('demo');
    for (let seconds = 0; seconds < 3600; seconds += 10) {
      await game.step(10);
      if (await game.page.evaluate(() => testClient.getState().world.phase === 'matchover')) break;
    }
    const result = await game.page.evaluate(async () => {
      const w = testClient.getState().world;
      const { STAT_ROWS } = await import('/src/view/statistics.js');
      const { t } = await import('/src/i18n.js');
      const { formatSetScore } = await import('/src/score-format.js');
      const { teamName } = await import('/src/view/hud.js');
      const transcript = document.getElementById('result-transcript').textContent;
      const lines = transcript.split('\n'), total = lines.indexOf(t('stats.total'));
      if (total < 0) throw new Error('Missing total statistics heading');
      const expectedHeading = [t('over.win', { team: teamName(w, w.score.winner) }),
        t('over.sets', { sets: w.score.sets.map(s => formatSetScore(s)).join('  ') })];
      const actualHeading = lines.slice(0, 2);
      const expectedTotalRows = STAT_ROWS.map(([key, label]) => t(label) + ': ' + (w.stats[key] ?? 0));
      const actualTotalRows = lines.slice(total + 1, total + 1 + STAT_ROWS.length);
      const { assertMatchInvariants } = await import('/src/sim/systems/phases.js'); assertMatchInvariants(w);
      return { phase: w.phase, seed: w.seed, elapsed: w.elapsed, winner: w.score.winner, sets: w.score.sets,
        stats: w.stats, history: w.setHistory, points: browserTest.events.filter(e => e.type === 'point'),
        expectedTotalRows, actualTotalRows, expectedHeading, actualHeading,
        transcript: document.getElementById('result-transcript').textContent, hidden: document.getElementById('result-transcript').hidden };
    });
    assert.equal(result.phase, 'matchover', 'Real demo must finish within 3600 simulated seconds');
    assert.ok(['a', 'b'].includes(result.winner)); assert.equal(result.hidden, false);
    assert.equal(result.stats.points, result.points.length); assert.ok(result.stats.serves > 0 && result.stats.hits > 0);
    for (const key of ['points', 'serves', 'hits', 'faults', 'aces']) {
      assert.equal(result.stats[key], result.history.reduce((sum, set) => sum + set[key], 0), key);
    }
    assert.deepEqual(result.actualTotalRows, result.expectedTotalRows, 'Localized totals must pair each statistic with its own label');
    assert.deepEqual(result.actualHeading, result.expectedHeading, 'Result heading must show the localized winner and set scores');
    await game.finish(); return result;
  },
});
