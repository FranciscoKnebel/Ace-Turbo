import { COURT } from '../sim/constants.js';
import { t } from '../i18n.js';
import { drawIcon, icon } from '../icons.js';
import { C, SKY, SURFACE_COLORS } from './palette.js';
import { project } from './camera.js';
import { poly, line3, fillRect3 } from './primitives.js';
export function drawSkyAndGround(ctx, view, time = 'night') {
  const pal = SKY[time] ?? SKY.night;
  const sky = ctx.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(0.55, pal.skyBottom);
  sky.addColorStop(1, pal.groundFar);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.width, view.height);

  // chão ao redor da quadra
  const g = COURT.DOUBLES_HALF_WIDTH + 4.5;
  const y0 = -(COURT.HALF_LENGTH + 3.2);
  const y1 = COURT.HALF_LENGTH + 3.6;
  poly(
    ctx,
    [
      project(view, -g, y0, 0),
      project(view, g, y0, 0),
      project(view, g, y1, 0),
      project(view, -g, y1, 0),
    ],
    pal.ground,
  );
}

// Rótulo do clima no menu (Dia/Noite/Ventania/Aleatório).

export function windArrow(wind) {
  const angle = Math.atan2(wind.y, wind.x);
  const arrows = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
  const idx = Math.round((angle / (Math.PI / 4) + 8)) % 8;
  return arrows[idx];
}


export function windLevel(strength) {
  if (strength < 0.75) return t('wind.light');
  if (strength < 1.05) return t('wind.medium');
  return t('wind.strong');
}

// Ícone do clima no canto + seta/intensidade do vento quando há vento.

export function drawWeatherBadge(ctx, v, world) {
  const w = world?.weather;
  if (!w) return;
  const iconName =
    w.kind === 'windy' ? 'weather-wind' : w.time === 'day' ? 'weather-sun' : 'weather-moon';
  const x = 30;
  const y = v.height - 30;
  drawIcon(ctx, icon(iconName), x, y, 30, 0.85);
  if (w.wind) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(229,231,235,0.85)';
    ctx.fillText(
      `${t('hud.wind')} ${windArrow(w.wind)} ${windLevel(w.wind.strength)}`,
      x + 22,
      y,
    );
  }
}

// Partículas leves mostrando a direção do vento.

export function drawWind(ctx, v, world) {
  const w = world?.weather;
  if (!w?.wind) return;
  const time = world.elapsed ?? 0;
  const dirX = w.wind.x;
  const dirY = -w.wind.y; // tela: +y do mundo aparece para cima
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  const mod = (n, m) => ((n % m) + m) % m;
  for (let i = 0; i < 16; i++) {
    const seedX = ((i * 137.5) % 100) / 100;
    const seedY = ((i * 61.7) % 100) / 100;
    const speed = 60 + ((i * 37) % 40);
    const x = mod(seedX * v.width + ux * speed * time, v.width + 200) - 100;
    const y = mod(seedY * v.height + uy * speed * time, v.height + 200) - 100;
    const l = 10 + (i % 5) * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + ux * l, y + uy * l);
    ctx.stroke();
  }
  ctx.restore();
}


export function drawCourt(ctx, view, surface = 'hard') {
  const colors = SURFACE_COLORS[surface] ?? SURFACE_COLORS.hard;
  const hw = COURT.DOUBLES_HALF_WIDTH;
  const hl = COURT.HALF_LENGTH;
  // área de duplas
  fillRect3(ctx, view, -hw, hw, -hl, hl, colors.court);
  // caixas de serviço
  fillRect3(ctx, view, -COURT.SINGLES_HALF_WIDTH, COURT.SINGLES_HALF_WIDTH, -COURT.SERVICE_LINE, COURT.SERVICE_LINE, colors.courtAlt);

  const L = 2;
  // linhas de fundo e laterais
  line3(ctx, view, { x: -hw, y: -hl }, { x: hw, y: -hl }, C.line, L);
  line3(ctx, view, { x: -hw, y: hl }, { x: hw, y: hl }, C.line, L);
  line3(ctx, view, { x: -hw, y: -hl }, { x: -hw, y: hl }, C.line, L);
  line3(ctx, view, { x: hw, y: -hl }, { x: hw, y: hl }, C.line, L);
  // simples
  line3(ctx, view, { x: -COURT.SINGLES_HALF_WIDTH, y: -hl }, { x: -COURT.SINGLES_HALF_WIDTH, y: hl }, C.line, L);
  line3(ctx, view, { x: COURT.SINGLES_HALF_WIDTH, y: -hl }, { x: COURT.SINGLES_HALF_WIDTH, y: hl }, C.line, L);
  // linhas de saque
  line3(ctx, view, { x: -COURT.SINGLES_HALF_WIDTH, y: -COURT.SERVICE_LINE }, { x: COURT.SINGLES_HALF_WIDTH, y: -COURT.SERVICE_LINE }, C.line, L);
  line3(ctx, view, { x: -COURT.SINGLES_HALF_WIDTH, y: COURT.SERVICE_LINE }, { x: COURT.SINGLES_HALF_WIDTH, y: COURT.SERVICE_LINE }, C.line, L);
  // linha central de saque
  line3(ctx, view, { x: 0, y: -COURT.SERVICE_LINE }, { x: 0, y: COURT.SERVICE_LINE }, C.line, L);
  // marcas centrais
  line3(ctx, view, { x: -0.15, y: -hl }, { x: -0.15, y: -hl + 0.4 }, C.line, L);
  line3(ctx, view, { x: 0.15, y: -hl }, { x: 0.15, y: -hl + 0.4 }, C.line, L);
  line3(ctx, view, { x: -0.15, y: hl }, { x: -0.15, y: hl - 0.4 }, C.line, L);
  line3(ctx, view, { x: 0.15, y: hl }, { x: 0.15, y: hl - 0.4 }, C.line, L);
}


export function drawNet(ctx, view) {
  const nw = COURT.NET_HALF_WIDTH;
  const samples = 13;
  const bottom = [];
  const top = [];
  for (let i = 0; i <= samples; i++) {
    const x = -nw + (2 * nw * i) / samples;
    const t = Math.min(1, Math.abs(x) / nw);
    const h = COURT.NET_HEIGHT_CENTER + t * (COURT.NET_HEIGHT_POST - COURT.NET_HEIGHT_CENTER);
    bottom.push(project(view, x, 0, 0));
    top.push(project(view, x, 0, h));
  }
  // malha translúcida
  const quad = [...bottom, ...top.slice().reverse()];
  poly(ctx, quad, C.net);
  // fita superior
  ctx.beginPath();
  const pts = top.filter(Boolean);
  if (pts.length > 1) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = C.netBand;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  // postes
  line3(ctx, view, { x: -nw, y: 0 }, { x: -nw, y: 0, z: COURT.NET_HEIGHT_POST }, C.post, 3);
  line3(ctx, view, { x: nw, y: 0 }, { x: nw, y: 0, z: COURT.NET_HEIGHT_POST }, C.post, 3);
}

// ---------------------------------------------------------------------------
// Jogadores e bola
// ---------------------------------------------------------------------------
// Posição da raquete no mundo: aponta para a bola quando ela está perto (ou
// para a rede, caso contrário) e varre durante o golpe. Usada pelo render e
// testável isoladamente.
