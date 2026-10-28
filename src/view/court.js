import { COURT } from '../sim/constants.js';
import { t } from '../i18n.js';
import { drawIcon, icon } from '../icons.js';
import { C, SKY, SURFACE_COLORS } from './palette.js';
import { project } from './camera.js';
import { poly, line3, fillRect3 } from './primitives.js';

// Hash determinístico em [0,1) para posições estáveis de estrelas e textura
// (a mesma partícula fica sempre no mesmo lugar, sem tremer por quadro).

function hash01(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export function drawSkyAndGround(ctx, view, time = 'night') {
  const pal = SKY[time] ?? SKY.night;
  // Horizonte real do plano do chão: projeção de um ponto bem longe.
  const horizon = project(view, 0, 500, 0)?.y ?? view.height * 0.5;
  const sky = ctx.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(0.55, pal.skyBottom);
  sky.addColorStop(1, pal.groundFar);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.width, view.height);

  // Estrelas fixas na noite, sempre acima do horizonte (posições
  // determinísticas para não tremer entre quadros).
  if (pal === SKY.night) {
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    for (let i = 0; i < 70; i++) {
      const x = hash01(i * 1.37 + 3.1) * view.width;
      const y = hash01(i * 2.13 + 9.7) * Math.max(40, horizon - 12);
      const a = 0.18 + hash01(i * 5.41 + 1.3) * 0.55;
      ctx.globalAlpha = a;
      ctx.fillRect(x, y, i % 7 === 0 ? 1.8 : 1.1, i % 7 === 0 ? 1.8 : 1.1);
    }
    ctx.globalAlpha = 1;
    // Brilho do refletor no horizonte, discretíssimo.
    const glow = ctx.createLinearGradient(0, horizon - view.height * 0.2, 0, horizon + view.height * 0.1);
    glow.addColorStop(0, 'rgba(250,240,200,0)');
    glow.addColorStop(1, 'rgba(250,240,200,0.05)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizon - view.height * 0.2, view.width, view.height * 0.3);
  } else {
    // Dia: neblina de horizonte para dar profundidade ao chão.
    const haze = ctx.createLinearGradient(0, horizon - view.height * 0.16, 0, horizon + view.height * 0.06);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, 'rgba(255,255,255,0.14)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - view.height * 0.16, view.width, view.height * 0.22);
  }

  // Chão contínuo do horizonte até a base da tela (sem emendas diagonais).
  const ground = ctx.createLinearGradient(0, horizon, 0, view.height);
  ground.addColorStop(0, pal.groundFar);
  ground.addColorStop(1, pal.ground);
  ctx.fillStyle = ground;
  ctx.fillRect(0, Math.max(0, horizon), view.width, Math.max(0, view.height - horizon));
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
  drawSurfaceTexture(ctx, view, surface);
}

// Textura por superfície: sombreamento de profundidade, faixas de grama,
// grãos de saibro e desgaste no duro. Posições determinísticas (hash01) para
// não tremer entre quadros.

function drawSurfaceTexture(ctx, view, surface) {
  const hw = COURT.DOUBLES_HALF_WIDTH;
  const hl = COURT.HALF_LENGTH;
  // Sombreamento de profundidade: piso mais escuro perto da câmera.
  const nearEdge = project(view, 0, -hl, 0);
  const farEdge = project(view, 0, hl, 0);
  if (nearEdge && farEdge) {
    const g = ctx.createLinearGradient && ctx.createLinearGradient(0, nearEdge.y, 0, farEdge.y);
    if (g?.addColorStop) {
      g.addColorStop(0, 'rgba(2,6,23,0.20)');
      g.addColorStop(1, 'rgba(2,6,23,0)');
      poly(
        ctx,
        [
          project(view, -hw, -hl, 0),
          project(view, hw, -hl, 0),
          project(view, hw, hl, 0),
          project(view, -hw, hl, 0),
        ],
        g,
      );
    }
  }
  if (surface === 'grass') {
    // Faixas de corte da grama alternadas ao longo do comprimento.
    const bands = 7;
    const bandLen = (hl * 2) / bands;
    for (let i = 0; i < bands; i++) {
      if (i % 2 === 0) continue;
      const y0 = -hl + i * bandLen;
      fillRect3(ctx, view, -hw, hw, y0, y0 + bandLen, 'rgba(255,255,255,0.045)');
    }
  } else if (surface === 'clay') {
    // Grãos do saibro.
    ctx.fillStyle = 'rgba(66,24,4,0.10)';
    for (let i = 0; i < 60; i++) {
      const x = (hash01(i * 1.71 + 0.5) * 2 - 1) * hw;
      const y = (hash01(i * 2.33 + 7.1) * 2 - 1) * hl;
      const p = project(view, x, y, 0);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, 0.02 * p.scale), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Duro: desgaste sutil perto das linhas de fundo.
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      const nearBaseline = hash01(i * 3.77 + 2.2) > 0.5;
      const x = (hash01(i * 1.19 + 4.4) * 2 - 1) * hw;
      const side = nearBaseline ? -1 : 1;
      const y = side * (hl - hash01(i * 2.71 + 6.6) * 2.4);
      const a = project(view, x, y, 0);
      const b = project(view, x + (hash01(i * 5.31 + 8.3) - 0.5) * 1.4, y + side * 0.5, 0);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
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
  // cordas verticais discretas para dar textura de rede de verdade
  const pts = bottom.filter(Boolean);
  if (pts.length > 1) {
    ctx.beginPath();
    for (let i = 1; i < samples; i++) {
      const b = bottom[i];
      const tTop = top[i];
      if (!b || !tTop) continue;
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(tTop.x, tTop.y);
    }
    ctx.strokeStyle = 'rgba(226,232,240,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // fita superior
  ctx.beginPath();
  const tops = top.filter(Boolean);
  if (tops.length > 1) {
    ctx.moveTo(tops[0].x, tops[0].y);
    for (let i = 1; i < tops.length; i++) ctx.lineTo(tops[i].x, tops[i].y);
    ctx.strokeStyle = C.netBand;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  // postes
  line3(ctx, view, { x: -nw, y: 0 }, { x: -nw, y: 0, z: COURT.NET_HEIGHT_POST }, C.post, 3);
  line3(ctx, view, { x: nw, y: 0 }, { x: nw, y: 0, z: COURT.NET_HEIGHT_POST }, C.post, 3);
}

// Vinheta de iluminação: cantos escuros em volta da quadra, mais forte na
// noite (floodlights) e discreta de dia. Pula quando o contexto não tem
// gradiente radial (testes).

export function drawVignette(ctx, view, time = 'night') {
  const strength = time === 'night' ? 0.3 : 0.16;
  const r = Math.hypot(view.width, view.height) * 0.62;
  const g = ctx.createRadialGradient && ctx.createRadialGradient(view.cx, view.height * 0.52, 0, view.cx, view.height * 0.52, r);
  if (!g?.addColorStop) return;
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.width, view.height);
}

// ---------------------------------------------------------------------------
// Jogadores e bola
// ---------------------------------------------------------------------------
// Posição da raquete no mundo: aponta para a bola quando ela está perto (ou
// para a rede, caso contrário) e varre durante o golpe. Usada pelo render e
// testável isoladamente.
