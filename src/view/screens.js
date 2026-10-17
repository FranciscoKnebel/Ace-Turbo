import { compactScreen } from './layout.js';
import { weatherTime, modeSlots, slotConfig, classLabel, slotLabel, playerStats, MODE_ORDER, difficultyLabel, bestOfLabel, modeLabel } from '../app/menu.js';
import { SURFACE_ORDER,  } from '../sim/constants.js';
import { CLASSES, STATS } from '../sim/stats.js';
import { drawContain, drawCover, imageReady, media } from '../media.js';
import { clamp } from '../sim/math.js';
import { t } from '../i18n.js';
import { C } from './palette.js';
import { roundRect, panel } from './primitives.js';
import { drawSkyAndGround, drawCourt, drawNet } from './court.js';
export function drawPause(ctx, v) {
  ctx.fillStyle = 'rgba(2,6,23,0.7)';
  ctx.fillRect(0, 0, v.width, v.height);
  drawContain(ctx, media.logoShort, v.cx, v.cy - 130, 128, 128, 0.9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(t('pause.title'), v.cx, v.cy - 30);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(t('pause.keys'), v.cx, v.cy + 30);
}

// ---------------------------------------------------------------------------
// Jogadores: classes e stats (50 a 99) e tela de configuração
// ---------------------------------------------------------------------------

export function statColor(value) {
  if (value >= 85) return '#38bdf8';
  if (value >= 70) return '#4ade80';
  if (value >= 60) return '#fbbf24';
  return '#f87171';
}


export function statRow(ctx, x, y, w, label, value) {
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(label, x, y);
  const bx = x + 96;
  const bw = w - 96 - 40;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx - 1, y - 7, bw + 2, 12);
  ctx.fillStyle = statColor(value);
  ctx.fillRect(bx, y - 6, bw * (value / STATS.MAX), 10);
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(String(value), x + w, y);
}


export function drawPlayers(ctx, v, menu) {
  drawSkyAndGround(ctx, v, weatherTime(menu.weatherIndex));
  drawCourt(ctx, v, SURFACE_ORDER[menu.surfaceIndex ?? 0] ?? 'hard');
  drawNet(ctx, v);
  ctx.fillStyle = 'rgba(2,6,23,0.82)';
  ctx.fillRect(0, 0, v.width, v.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText(t('players.title'), v.cx, Math.min(50, v.height * 0.07));
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(t('players.hint'), v.cx, Math.min(82, v.height * 0.12));

  const slots = modeSlots(MODE_ORDER[menu.modeIndex]);
  const state = menu.players ?? { focus: 0, selected: 0, config: {} };
  const focus = state.focus ?? 0;
  const selected = Math.min(state.selected ?? 0, slots.length - 1);
  const boxW = Math.min(660, v.width - 60);
  const x0 = v.cx - boxW / 2;
  const top = Math.min(112, v.height * 0.17);
  const step = Math.min(46, (v.height * 0.52) / (slots.length + STATS.KEYS.length));

  slots.forEach((slot, i) => {
    const y = top + i * step;
    const focused = focus === i;
    panel(ctx, x0, y - step * 0.4, boxW, step * 0.8);
    if (focused) {
      ctx.strokeStyle = C.ball;
      ctx.lineWidth = 2;
      roundRect(ctx, x0, y - step * 0.4, boxW, step * 0.8, 10);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = slot.human ? C.a : C.b;
    ctx.fillText(slotLabel(slots, i), x0 + 18, y);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(slot.human ? t('players.human') : t('players.cpu'), x0 + 96, y + 1);
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = selected === i ? C.ball : C.text;
    ctx.textAlign = 'right';
    ctx.fillText(classLabel(slotConfig(menu, slot).classId), x0 + boxW - 18, y);
  });

  // Stats do jogador selecionado, editáveis (o foco desce para elas).
  const slot = slots[selected];
  const stats = playerStats(menu, slot);
  const statTop = top + slots.length * step + 10;
  const statStep = Math.min(40, (v.height * 0.32) / STATS.KEYS.length);
  STATS.KEYS.forEach((key, i) => {
    const y = statTop + i * statStep;
    const focused = focus === slots.length + i;
    const sx = v.cx - Math.min(420, v.width * 0.42) / 2;
    const sw = Math.min(420, v.width * 0.42);
    if (focused) {
      ctx.fillStyle = 'rgba(56,189,248,0.12)';
      ctx.fillRect(sx - 12, y - 15, sw + 24, 30);
    }
    statRow(ctx, sx, y, sw, t(`stat.${key}`), stats[key]);
  });

  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(t('players.back'), v.cx, v.height - 24);
}

// ---------------------------------------------------------------------------
// Estatísticas: tabela por set + total (fim de set e fim de jogo)
// ---------------------------------------------------------------------------

export function drawLoading(ctx, v, world, menu, progress = 0) {
  if (compactScreen(v)) return drawCompactLoading(ctx, v, world, menu, progress);
  if (imageReady(media.landing)) {
    drawCover(ctx, media.landing, v.width, v.height);
  } else {
    drawSkyAndGround(ctx, v, world.weather?.time);
    drawCourt(ctx, v, world.surface);
    drawNet(ctx, v);
  }
  ctx.fillStyle = 'rgba(2,6,23,0.82)';
  ctx.fillRect(0, 0, v.width, v.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText(t('loading.title'), v.cx, Math.min(64, v.height * 0.1));

  const humans = world.players.filter((p) => p.human).length;
  const cpus = world.players.length - humans;
  const info = [
    `${t('loading.match')}: ${t(`mode.${MODE_ORDER[menu.modeIndex]}.label`)}`,
    `${t('loading.format')}: ${bestOfLabel(menu.bestOfIndex ?? 0)}` +
      `${(menu.finalSetIndex ?? 0) === 1 ? ` • ${t('menu.finalSet_super')}` : ''}` +
      `${(menu.scoringIndex ?? 0) === 1 ? ` • ${t('menu.scoring_noad')}` : ''}`,
    `${t('loading.difficulty')}: ${difficultyLabel(menu.difficultyIndex)}`,
    `${t('loading.surface')}: ${t(`surface.${world.surface ?? 'hard'}`)}`,
    `${t('loading.weather')}: ${t(`weather.${world.weather?.kind ?? 'night'}`)}`,
    t('loading.count', { total: world.players.length, humans, cpus }),
  ];
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  info.forEach((line, i) => ctx.fillText(line, v.cx, Math.min(108, v.height * 0.16) + i * 22));

  // Cartões dos jogadores: nome, classe e as quatro stats.
  const slots = modeSlots(MODE_ORDER[menu.modeIndex]);
  const perRow = Math.min(2, slots.length);
  const cardW = Math.min(420, (v.width - 80) / perRow - 16);
  const cardH = 132;
  const top = Math.min(220, v.height * 0.32);
  slots.forEach((slot, i) => {
    const player = world.byId[slot.id];
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = v.cx - (perRow * cardW + (perRow - 1) * 16) / 2 + col * (cardW + 16);
    const y = top + row * (cardH + 14);
    panel(ctx, x, y, cardW, cardH);
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = slot.human ? C.a : C.b;
    ctx.fillText(`${slotLabel(slots, i)}  ${slot.human ? `(${t('players.human')})` : ''}`, x + 14, y + 22);
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = C.ball;
    ctx.fillText(classLabel(player?.classId ?? 'balanced'), x + 14, y + 46);
    const stats = player?.stats ?? CLASSES.balanced;
    STATS.KEYS.forEach((key, k) => {
      statRow(ctx, x + 14, y + 70 + k * 17, cardW - 28, t(`stat.${key}`), stats[key]);
    });
  });

  // Barra de progresso.
  const bw = Math.min(520, v.width - 80);
  const bx = v.cx - bw / 2;
  const by = v.height - 64;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx - 1, by - 1, bw + 2, 12);
  ctx.fillStyle = C.ball;
  ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, progress)), 10);
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(t('loading.hint'), v.cx, by + 28);
}

// Fundo do menu e das configurações (imagem de marca ou quadra).

export function drawCompactLoading(ctx, v, world, menu, progress) {
  ctx.fillStyle = '#07211a'; ctx.fillRect(0, 0, v.width, v.height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.ball;
  const short = v.height < 340;
  ctx.font = short ? 'bold 24px system-ui, sans-serif' : 'bold 26px system-ui, sans-serif'; ctx.fillText(t('loading.title'), v.cx, 28, v.width - 32);
  const info = [modeLabel(world.mode), bestOfLabel(menu.bestOfIndex ?? 0), difficultyLabel(menu.difficultyIndex ?? 0),
    t('surface.' + world.surface), t('weather.' + world.weather.kind),
    t('loading.count', { total: world.players.length, humans: world.players.filter(p => p.human).length, cpus: world.players.filter(p => !p.human).length })];
  ctx.font = short ? '12px system-ui, sans-serif' : '14px system-ui, sans-serif'; ctx.fillStyle = C.text;
  info.forEach((text, i) => ctx.fillText(text, v.cx, (short ? 48 : 54) + i * (short ? 12 : 16), v.width - 32));
  const slots = modeSlots(world.mode);
  const maxRows = Math.max(1, Math.floor((v.height - 36 - (short ? 128 : 158)) / (short ? 56 : 68)));
  const columns = Math.max(v.width >= 480 ? 2 : 1, Math.ceil(slots.length / maxRows));
  const cardW = (v.width - 32 - (columns - 1) * 12) / columns;
  slots.forEach((slot, i) => {
    const x = 16 + i % columns * (cardW + 12), y = (short ? 128 : 158) + Math.floor(i / columns) * (short ? 56 : 68);
    const player = world.byId[slot.id]; panel(ctx, x, y, cardW, short ? 48 : 60);
    ctx.textAlign = 'left'; ctx.fillStyle = C.ball; ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(slotLabel(slots, i) + ' • ' + classLabel(player.classId), x + 10, y + 17, cardW - 20);
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = C.text;
    ctx.fillText(STATS.KEYS.map(key => t('stat.' + key) + ' ' + player.stats[key]).join(' • '), x + 10, y + (short ? 34 : 42), cardW - 20);
  });
  ctx.fillStyle = C.ball; ctx.fillRect(16, v.height - 36, (v.width - 32) * clamp(progress, 0, 1), 8);
  ctx.textAlign = 'center'; ctx.fillStyle = C.dim; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(t('loading.hint'), v.cx, v.height - 14, v.width - 32);
}
