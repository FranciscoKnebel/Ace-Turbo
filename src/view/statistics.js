import { compactScreen } from './layout.js';
import { drawContain, media } from '../media.js';
import { t } from '../i18n.js';
import { C } from './palette.js';
import { panel } from './primitives.js';
import { teamName } from './hud.js';
export const STAT_ROWS = [
  ['serves', 'stats.serves'],
  ['firstServes', 'stats.firstServes'],
  ['secondServes', 'stats.secondServes'],
  ['aces', 'stats.aces'],
  ['faults', 'stats.faults'],
  ['doubleFaults', 'stats.doubleFaults'],
  ['lets', 'stats.lets'],
  ['hits', 'stats.hits'],
  ['winners', 'stats.winners'],
  ['errorsOut', 'stats.errorsOut'],
  ['errorsNet', 'stats.errorsNet'],
  ['touches', 'stats.touches'],
  ['turboShots', 'stats.turbo'],
];


export function statsShotsLine(stats) {
  return t('stats.shotsLine', {
    flat: stats.shots.flat,
    topspin: stats.shots.topspin,
    slice: stats.shots.slice,
    lob: stats.shots.lob,
  });
}


export function drawStatsTable(ctx, v, top, columns) {
  const w = Math.min(760, v.width - 60);
  const x0 = v.cx - w / 2;
  const labelW = Math.min(210, w * 0.3);
  const colW = (w - labelW) / Math.max(1, columns.length);
  const rowH = 19;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText(t('stats.title'), x0 + 8, top);
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  columns.forEach((c, i) => ctx.fillText(c.label, x0 + labelW + colW * (i + 0.5), top));
  STAT_ROWS.forEach((row, r) => {
    const y = top + (r + 1) * rowH;
    if (r % 2 === 0) {
      ctx.fillStyle = 'rgba(148,163,184,0.08)';
      ctx.fillRect(x0, y - rowH / 2, w, rowH);
    }
    ctx.textAlign = 'left';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(t(row[1]), x0 + 8, y);
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    columns.forEach((c, i) =>
      ctx.fillText(String(c.stats[row[0]] ?? 0), x0 + labelW + colW * (i + 0.5), y),
    );
  });
  return top + (STAT_ROWS.length + 1) * rowH;
}

// Estatísticas do set encerrado, mostradas durante a pausa do fim do set.

export function drawSetSummary(ctx, v, world) {
  if (world.phase !== 'pointover' || !world.setSummary) return;
  const stats = world.setSummary;
  const setNo = world.setHistory.length;
  const w = Math.min(620, v.width - 80);
  const x0 = v.cx - w / 2;
  const y0 = Math.min(112, v.height * 0.16);
  const half = Math.ceil(STAT_ROWS.length / 2);
  const h = 52 + half * 22;
  panel(ctx, x0, y0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText(t('stats.setTitle', { n: setNo }), v.cx, y0 + 20);
  STAT_ROWS.forEach((row, i) => {
    const col = i < half ? 0 : 1;
    const line = i % half;
    const x = x0 + 18 + col * (w / 2 - 4);
    const y = y0 + 46 + line * 22;
    ctx.textAlign = 'left';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(t(row[1]), x, y);
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(stats[row[0]] ?? 0), x + w / 2 - 44, y);
  });
  ctx.textAlign = 'center';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(statsShotsLine(stats), v.cx, y0 + h - 14, w - 24);
}

// ---------------------------------------------------------------------------
// Carregando: mostra o tipo de jogador, o modo e o formato antes da partida
// ---------------------------------------------------------------------------

export function drawGameOver(ctx, v, world, page = 0) {
  if (compactScreen(v)) return drawCompactGameOver(ctx, v, world, page);
  ctx.fillStyle = 'rgba(2,6,23,0.84)';
  ctx.fillRect(0, 0, v.width, v.height);
  drawContain(ctx, media.logoShort, v.cx, 46, 68, 68, 0.9);
  const team = world.score.winner;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 38px system-ui, sans-serif';
  ctx.fillStyle = team === 'a' ? C.a : C.b;
  ctx.fillText(t('over.win', { team: teamName(world, team) }), v.cx, 96);
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  const sets = world.score.sets.map((s) => `${s.a}-${s.b}`).join('  ');
  ctx.fillText(t('over.sets', { sets }), v.cx, 126);
  // Um set por coluna + o somatório total da partida.
  const columns = world.setHistory.map((stats, i) => ({
    label: t('stats.set', { n: i + 1 }),
    stats,
  }));
  columns.push({ label: t('stats.total'), stats: world.stats });
  const bottom = drawStatsTable(ctx, v, 152, columns);
  ctx.textAlign = 'center';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(statsShotsLine(world.stats), v.cx, bottom + 14);
  const reasons = Object.entries(world.stats.reasons)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${t(`reason.${key}`)} ${n}`)
    .join('   •   ');
  if (reasons) ctx.fillText(reasons, v.cx, bottom + 34);
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(t('over.keys'), v.cx, Math.min(v.height - 24, bottom + 66));
}


export function drawCompactGameOver(ctx, v, world, page) {
  ctx.fillStyle = 'rgba(2,6,23,0.96)'; ctx.fillRect(0, 0, v.width, v.height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.ball;
  ctx.font = 'bold 26px system-ui, sans-serif'; ctx.fillText(t('over.win', { team: teamName(world, world.score.winner) }), v.cx, 28, v.width - 32);
  ctx.font = '16px system-ui, sans-serif'; ctx.fillStyle = C.text;
  ctx.fillText(t('over.sets', { sets: world.score.sets.map(s => `${s.a}-${s.b}`).join('  ') }), v.cx, 58, v.width - 32);
  const summaries = [{ label: t('stats.total'), stats: world.stats }, ...world.setHistory.map((stats, i) => ({ label: t('stats.set', { n: i + 1 }), stats }))];
  const index = ((page % summaries.length) + summaries.length) % summaries.length;
  const summary = summaries[index]; ctx.fillText(summary.label, v.cx, 85);
  const columns = v.width >= 600 ? 2 : 1, rows = Math.ceil(STAT_ROWS.length / columns), colW = (v.width - 48) / columns;
  const rowH = Math.min(22, Math.max(15, (v.height - 190) / rows));
  STAT_ROWS.forEach(([key, label], i) => {
    const x = 24 + Math.floor(i / rows) * colW, y = 112 + i % rows * rowH;
    ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = C.dim;
    ctx.fillText(t(label), x, y, colW - 48); ctx.textAlign = 'right'; ctx.fillStyle = C.text;
    ctx.fillText(String(summary.stats[key] ?? 0), x + colW - 12, y);
  });
  const bottom = 112 + rows * rowH;
  ctx.textAlign = 'center'; ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = C.dim;
  ctx.fillText(statsShotsLine(summary.stats), v.cx, bottom + 8, v.width - 32);
  const reasons = Object.entries(summary.stats.reasons).map(([key, n]) => `${t('reason.' + key)} ${n}`).join(' • ');
  if (reasons) ctx.fillText(reasons, v.cx, bottom + 28, v.width - 32);
  ctx.fillStyle = C.text; ctx.fillText(t('over.keys'), v.cx, v.height - 36, v.width - 32);
  if (summaries.length > 1) ctx.fillText(`← / →  ${index + 1} / ${summaries.length}`, v.cx, v.height - 16);
}
