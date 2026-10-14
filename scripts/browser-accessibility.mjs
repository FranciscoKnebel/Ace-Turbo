import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { runBrowserSuite } from './lib/browser-harness.mjs';

await runBrowserSuite('accessibility', {
  async keyboardNavigation({ open }) {
    const game = await open({ controlled: false }), { page } = game;
    const focus = () => page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id, action: document.activeElement.dataset.action }));
    await page.keyboard.press('Tab'); assert.equal((await focus()).id, 'game');
    const canvasFocus = await page.locator('#game').evaluate(e => {
      const s = getComputedStyle(e), r = e.getBoundingClientRect(), width = parseFloat(s.outlineWidth), offset = parseFloat(s.outlineOffset);
      return { style: s.outlineStyle, color: s.outlineColor, width, offset,
        bounds: { left: r.left - offset - width, top: r.top - offset - width, right: r.right + offset + width, bottom: r.bottom + offset + width },
        viewport: { width: innerWidth, height: innerHeight } };
    });
    assert.equal(canvasFocus.style, 'solid'); assert.equal(canvasFocus.width, 3); assert.equal(canvasFocus.color, 'rgb(253, 224, 71)');
    assert.ok(canvasFocus.bounds.left >= 0 && canvasFocus.bounds.top >= 0 && canvasFocus.bounds.right <= canvasFocus.viewport.width && canvasFocus.bounds.bottom <= canvasFocus.viewport.height, 'Canvas focus outline must fit inside the unclipped viewport');
    await page.keyboard.press('Tab'); assert.equal((await focus()).tag, 'SUMMARY');
    await game.press('Enter'); assert.equal(await page.locator('details').evaluate(e => e.open), true);
    await game.press('Tab'); assert.equal((await focus()).id, 'mode-select');
    await game.press('End'); assert.equal(await page.locator('#mode-select').inputValue(), 'demo');
    await game.press('Tab'); assert.equal((await focus()).action, 'start');
    const outline = await page.locator('[data-action="start"]').evaluate(e => getComputedStyle(e).outlineWidth);
    assert.equal(outline, '3px');
    await game.press('Enter'); assert.equal((await focus()).id, 'game');
    assert.equal(await page.evaluate(() => testClient.getState().world.mode), 'demo');
    await game.press('KeyM'); await game.press('Tab'); await game.press('Enter'); await game.press('Tab');
    await game.press('Escape'); assert.equal((await focus()).id, 'game');
    assert.equal(await page.locator('details').evaluate(e => e.open), false);
    assert.equal(await page.evaluate(() => testClient.getState().screen), 'menu');
    await game.finish(); return { navigation: 'Tab, Enter, End, Escape', focusOutline: outline, canvasFocus, nativeMode: 'demo', returnFocus: 'game' };
  },
  async htmlAudits({ open }) {
    const scans = [];
    for (const locale of ['pt-BR', 'en-US']) {
      const game = await open({ controlled: false, locale }), { page } = game;
      const audit = async state => {
        const result = await new AxeBuilder({ page }).analyze();
        const scan = { locale, state, axeVersion: result.testEngine.version, violations: result.violations,
          incomplete: result.incomplete, passedRules: result.passes.map(rule => rule.id) };
        scans.push(scan);
        // Preserve violations even if this scan fails, alongside the suite report.
        const { writeFile } = await import('node:fs/promises');
        await writeFile(new URL('accessibility-scans.json', game.directory), JSON.stringify(scans, null, 2) + '\n');
        assert.deepEqual(result.violations, [], `${locale}/${state}: axe violations`);
      };
      await game.step(.05);
      assert.equal(await page.locator('html').getAttribute('lang'), locale === 'pt-BR' ? 'pt-BR' : 'en');
      assert.ok(await page.locator('#game').getAttribute('aria-label'));
      assert.equal(await page.locator('#game-status').getAttribute('role'), 'status');
      await audit('closed-menu'); await page.locator('summary').click(); await audit('open-menu');
      await page.locator('[data-action="help"]').click(); await game.step(.05);
      assert.equal(await page.locator('#help-transcript').isVisible(), true);
      assert.ok((await page.locator('#help-transcript').textContent()).length > 200); await audit('help');
      await page.locator('[data-action="menu"]').click(); await game.start('demo'); await audit('playing');
      // Presentation fixture, separately from the genuinely completed match in
      // browser-gameplay: unique nonzero values make transcript omissions visible.
      const expected = await page.evaluate(async () => {
        const { makeStats } = await import('/src/sim/world.js');
        const { teamName } = await import('/src/view/hud.js');
        const { STAT_ROWS, statsShotsLine } = await import('/src/view/statistics.js');
        const { t } = await import('/src/i18n.js');
        const w = testClient.getState().world;
        w.phase = 'matchover'; w.score.winner = 'a';
        w.score.sets = [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 7, b: 6 }, { a: 2, b: 6 }, { a: 6, b: 3 }];
        w.setHistory = Array.from({ length: 5 }, (_, i) => {
          const s = makeStats(); for (const [n, [key]] of STAT_ROWS.entries()) s[key] = (i + 1) * 100 + n;
          s.reasons.out = i + 1;
          for (const [n, key] of Object.keys(s.shots).entries()) s.shots[key] = (i + 1) * 10 + n;
          return s;
        });
        w.stats = makeStats(); for (const [key] of STAT_ROWS) w.stats[key] = w.setHistory.reduce((n, s) => n + s[key], 0);
        for (const group of ['shots', 'hands', 'situations', 'serveTypes', 'reasons']) {
          for (const set of w.setHistory) for (const [key, value] of Object.entries(set[group])) w.stats[group][key] = (w.stats[group][key] ?? 0) + value;
        }
        if (!Object.values(w.stats.shots).some(n => n > 0) || !Object.values(w.stats.reasons).some(n => n > 0)) throw Error('Fixture must exercise nonzero totals');
        return [t('over.win', { team: teamName(w, w.score.winner) }), t('over.sets', { sets: w.score.sets.map(s => `${s.a}-${s.b}`).join('  ') }), t('stats.total'), ...w.setHistory.map((_, i) => t('stats.set', { n: i + 1 })),
          ...[w.stats, ...w.setHistory].flatMap(s => [...STAT_ROWS.map(([key, label]) => t(label) + ': ' + s[key]), statsShotsLine(s),
            ...Object.entries(s.reasons).map(([key, n]) => t('reason.' + key) + ': ' + n)])];
      });
      await game.step(.05); await page.locator('summary').click(); await game.step(.05);
      assert.equal(await page.locator('#result-transcript').isVisible(), true);
      const text = await page.locator('#result-transcript').textContent(); for (const line of expected) assert.ok(text.includes(line), line);
      await audit('result-five-set-fixture'); await game.finish();
    }
    return { scans: scans.map(({ locale, state, violations, incomplete, axeVersion }) => ({ locale, state, axeVersion, violations: violations.length, incomplete: incomplete.length })),
      limitation: 'Automated HTML audit; Canvas contrast, reader announcements and physical keyboard require human review.' };
  },
});
