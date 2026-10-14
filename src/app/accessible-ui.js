import { formatSetScore } from '../score-format.js';
import { LANGS, getLang, t } from '../i18n.js';
import { presentMessage } from './messages.js';
import { MODE_ORDER } from './menu.js';
import { STAT_ROWS, statsShotsLine } from '../view/statistics.js';
import { teamName } from '../view/hud.js';
export function bindAccessibleUI(doc, actions) {
  if (!doc?.querySelectorAll) return { update() {}, dispose() {} };
  const listeners = [], elements = [...doc.querySelectorAll('[data-action]')];
  for (const element of elements) {
    const type = element.tagName === 'SELECT' ? 'change' : 'click';
    const listener = () => {
      const action = element.dataset.action;
      actions[action]?.(element.value);
      if (['start', 'players', 'settings', 'pause', 'menu'].includes(action)) {
        const panel = element.closest?.('details'); if (panel) panel.open = false;
        doc.getElementById('game')?.focus?.();
      }
    };
    element.addEventListener(type, listener); listeners.push([element, type, listener]);
  }
  const status = doc.getElementById('game-status'), help = doc.getElementById('help-transcript'), result = doc.getElementById('result-transcript');
  let previousLang = null, previousStatus = null, previousResult = null;
  return {
    update({ screen, paused, menu, world }) {
      const lang = getLang();
      if (lang !== previousLang) {
        previousLang = lang; doc.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
        for (const element of doc.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
        const canvas = doc.getElementById('game'); canvas?.setAttribute('aria-label', t('ui.canvas'));
        if (help) help.textContent = Object.keys(LANGS[lang]).filter(key => key.startsWith('help.') && key !== 'help.back').map(key => t(key)).join('\n\n');
      }
      const select = doc.getElementById('mode-select'); if (select) { select.value = MODE_ORDER[menu.modeIndex]; for (const option of select.options) option.textContent = t('mode.' + option.value + '.label'); }
      const audio = doc.getElementById('audio-toggle'); if (audio) { audio.textContent = t('ui.audio') + ': ' + t(menu.muted ? 'ui.muted' : 'ui.soundOn'); audio.setAttribute('aria-pressed', String(menu.muted)); }
      const message = world?.messageTimer > 0 ? presentMessage(world.message) : '';
      const score = world ? `${world.score.games.a}–${world.score.games.b}, ${world.score.pointsLabel('a')}–${world.score.pointsLabel('b')}` : '';
      const announcement = [world?.phase === 'matchover' ? t('ui.result') : t('ui.screen.' + screen), paused ? t('ui.paused') : '', score, message].filter(Boolean).join('. ');
      if (status && announcement !== previousStatus) { status.textContent = announcement; previousStatus = announcement; }
      if (help) help.hidden = screen !== 'help';
      const resultKey = world?.phase === 'matchover' ? lang + ':' + world.seed + ':' + JSON.stringify([world.score.sets, world.score.winner, world.stats]) : null;
      if (result) {
        result.hidden = !resultKey;
        if (resultKey && resultKey !== previousResult) {
          const summaries = [{ label: t('stats.total'), stats: world.stats }, ...world.setHistory.map((stats, i) => ({ label: t('stats.set', { n: i + 1 }), stats }))];
          const heading = t('over.win', { team: teamName(world, world.score.winner) }) + '\n' + t('over.sets', { sets: world.score.sets.map(s => formatSetScore(s)).join('  ') });
          result.textContent = heading + '\n' + summaries.map(s => s.label + '\n' + STAT_ROWS.map(([key, label]) => t(label) + ': ' + (s.stats[key] ?? 0)).join('\n') + '\n' + statsShotsLine(s.stats) + '\n' + Object.entries(s.stats.reasons).filter(([, n]) => n > 0).map(([key, n]) => t('reason.' + key) + ': ' + n).join('\n')).join('\n\n'); previousResult = resultKey;
        }
        if (!resultKey) previousResult = null;
      }
    },
    dispose: () => { for (const [element, type, listener] of listeners) element.removeEventListener(type, listener); },
  };
}
