import { weatherTime, MODE_ORDER, SETTING_KINDS, SETTINGS_CATEGORIES, settingRow, menuRows } from '../app/menu.js';
import { SURFACE_ORDER,  } from '../sim/constants.js';
import { drawContain, drawCover, imageReady, media } from '../media.js';
import { t } from '../i18n.js';
import { C, SURFACE_COLORS } from './palette.js';
import { sub } from './camera.js';
import { roundRect, panel } from './primitives.js';
import { drawSkyAndGround, drawCourt, drawNet } from './court.js';
export function drawMenuBackdrop(ctx, v, menu) {
  const surface = SURFACE_ORDER[menu.surfaceIndex ?? 0] ?? 'hard';
  const time = weatherTime(menu.weatherIndex);
  if (imageReady(media.landing)) {
    drawCover(ctx, media.landing, v.width, v.height);
    const grad = ctx.createLinearGradient(0, 0, 0, v.height);
    grad.addColorStop(0, 'rgba(2,6,23,0.62)');
    grad.addColorStop(0.45, 'rgba(2,6,23,0.3)');
    grad.addColorStop(1, 'rgba(2,6,23,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, v.width, v.height);
  } else {
    drawSkyAndGround(ctx, v, time);
    drawCourt(ctx, v, surface);
    drawNet(ctx, v);
    ctx.fillStyle = 'rgba(2,6,23,0.62)';
    ctx.fillRect(0, 0, v.width, v.height);
  }
  return surface;
}

// Desenha uma linha do menu/configurações.

export function drawMenuRow(ctx, row, opts) {
  const { x0, y, step, boxW, focused, selected, surface, showKey } = opts;
  panel(ctx, x0, y - step * 0.42, boxW, step * 0.84);
  if (focused) {
    ctx.strokeStyle = C.ball;
    ctx.lineWidth = 2;
    roundRect(ctx, x0, y - step * 0.42, boxW, step * 0.84, 10);
    ctx.stroke();
  }
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = selected || focused ? C.ball : C.text;
  const prefix = showKey && row.key ? `${row.key}  ` : '';
  ctx.fillText(`${prefix}${row.label}`, x0 + 20, y - 2);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  const subX = x0 + (prefix ? 58 : 150);
  ctx.fillText(row.sub, subX, y + step * 0.24);
  if (row.kind === 'surface') {
    // Prévia da quadra: aparece mesmo com a imagem de fundo carregada.
    const sw = ctx.measureText(row.sub).width;
    const colors = SURFACE_COLORS[surface] ?? SURFACE_COLORS.hard;
    ctx.fillStyle = colors.court;
    roundRect(ctx, subX + sw + 10, y + step * 0.24 - 8, 16, 16, 4);
    ctx.fill();
  }
  if (focused && SETTING_KINDS.has(row.kind)) {
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = C.ball;
    ctx.textAlign = 'right';
    ctx.fillText(t('menu.qe'), x0 + boxW - 18, y - 2);
  } else if (focused && row.kind === 'mode') {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(253,224,71,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText('◀ ▶', x0 + boxW - 18, y - 2);
  } else if (focused && (row.kind === 'help' || row.kind === 'players' || row.kind === 'settings')) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(253,224,71,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText(t('menu.enter'), x0 + boxW - 18, y - 2);
  }
  if (selected) {
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = C.ball;
    ctx.textAlign = 'right';
    ctx.fillText(t('menu.selected'), x0 + boxW - (focused ? 92 : 18), y - 2);
  }
}


export function drawMenu(ctx, v, menu) {
  const surface = drawMenuBackdrop(ctx, v, menu);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleY = Math.min(66, v.height * 0.1);
  const titleH = Math.min(88, v.height * 0.14);
  const drewLogo = drawContain(ctx, media.logo, v.cx, titleY, Math.min(560, v.width * 0.58), titleH);
  if (!drewLogo) {
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillStyle = C.ball;
    ctx.fillText('ACE TURBO', v.cx, Math.min(62, v.height * 0.09));
  }
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(t('menu.tagline'), v.cx, Math.min(120, v.height * 0.175));

  const rows = menuRows(menu);
  const focus = menu.focus ?? 0;
  const boxW = Math.min(640, v.width - 60);
  const x0 = v.cx - boxW / 2;
  const top = Math.min(158, v.height * 0.235);
  const step = Math.min(50, (v.height * 0.6) / rows.length);

  rows.forEach((row, i) => {
    drawMenuRow(ctx, row, {
      x0,
      y: top + i * step,
      step,
      boxW,
      focused: i === focus,
      selected: row.kind === 'mode' && MODE_ORDER[menu.modeIndex] === row.modeId,
      surface,
      showKey: true,
    });
  });

  const hintY = top + rows.length * step + 14;
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(t('menu.hint', { n: rows.length }), v.cx, hintY);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(229,231,235,0.55)';
  ctx.fillText(t('menu.controlsHint'), v.cx, Math.min(hintY + 24, v.height - 16));
}

// Tela de Configurações: categorias em abas (Partida, Quadra, Geral) e as
// linhas de cada uma. Reduz os itens do menu principal.

export function drawSettings(ctx, v, menu) {
  const surface = drawMenuBackdrop(ctx, v, menu);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText(t('menu.settings'), v.cx, Math.min(70, v.height * 0.11));

  const cats = SETTINGS_CATEGORIES;
  const catIndex = Math.min(menu.settings?.category ?? 0, cats.length - 1);
  const rows = cats[catIndex].rows.map((kind) => settingRow(kind, menu)).filter(Boolean);
  const boxW = Math.min(640, v.width - 60);
  const x0 = v.cx - boxW / 2;
  const tabY = Math.min(124, v.height * 0.19);
  const tabW = boxW / cats.length;
  cats.forEach((cat, i) => {
    const tx = x0 + tabW * i;
    const active = i === catIndex;
    panel(ctx, tx + 4, tabY - 18, tabW - 8, 36);
    if (active) {
      ctx.strokeStyle = C.ball;
      ctx.lineWidth = 2;
      roundRect(ctx, tx + 4, tabY - 18, tabW - 8, 36, 8);
      ctx.stroke();
    }
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = active ? C.ball : C.dim;
    ctx.textAlign = 'center';
    ctx.fillText(t(`settings.${cat.id}`), tx + tabW / 2, tabY);
  });

  const top = tabY + Math.min(64, v.height * 0.09);
  const step = Math.min(50, (v.height * 0.5) / Math.max(1, rows.length));
  const focus = menu.settings?.focus ?? 0;
  rows.forEach((row, i) => {
    drawMenuRow(ctx, row, {
      x0,
      y: top + i * step,
      step,
      boxW,
      focused: i === focus,
      selected: false,
      surface,
      showKey: false,
    });
  });

  const hintY = top + rows.length * step + 14;
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(t('settings.hint'), v.cx, hintY);
}

// Tela "Como jogar": controles, batidas, saque e regras.
