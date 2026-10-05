import { COURT, PLAYER, SERVE, STAMINA, SURFACE_ORDER } from './sim/constants.js';
import { MODES, serveAimTarget } from './sim/world.js';
import { CLASSES, CONFIG_KEYS, STATS, clampStat } from './sim/stats.js';
import { drawContain, drawCover, imageReady, media } from './media.js';
import { clamp } from './sim/math.js';
import { LANG_ORDER, t } from './i18n.js';
import { actionIcon, drawIcon, icon } from './icons.js';

const C = {
  skyTop: '#0a2b3a',
  skyBottom: '#0b3b2c',
  ground: '#0b3b2c',
  groundFar: '#082a20',
  court: '#1b4f97',
  courtAlt: '#215ba9',
  line: 'rgba(255,255,255,0.92)',
  net: 'rgba(15,23,42,0.8)',
  netBand: '#e2e8f0',
  post: '#cbd5e1',
  a: '#38bdf8',
  b: '#fb7185',
  ball: '#fde047',
  text: '#e5e7eb',
  dim: 'rgba(229,231,235,0.65)',
  human: '#ffffff',
};

// Cores da quadra por superfície (o resto da cena fica igual).
const SURFACE_COLORS = {
  hard: { court: '#1b4f97', courtAlt: '#215ba9' },
  clay: { court: '#b45309', courtAlt: '#c2620c' },
  grass: { court: '#15803d', courtAlt: '#166534' },
};

// Nome do lado. No modo versus os jogadores trocam de lado, então o nome segue
// o jogador (P1/P2), não a metade da quadra.
function teamName(world, team) {
  if (world.mode === 'versus') {
    const human = world.players.find((p) => p.team === team && p.human);
    return t(human && human.id === 'a1' ? 'team.versusA' : 'team.versusB');
  }
  const mode = ['coop', 'singles', 'demo'].includes(world.mode) ? world.mode : 'singles';
  return t(`team.${mode}${team === 'a' ? 'A' : 'B'}`);
}

// ---------------------------------------------------------------------------
// Câmera em perspectiva (3D)
// ---------------------------------------------------------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

export function computeView(width, height) {
  const pos = { x: 0, y: -(COURT.HALF_LENGTH + 8.0), z: 5.2 };
  const target = { x: 0, y: 1.5, z: 0.8 };
  const f = norm(sub(target, pos));
  const r = norm(cross(f, { x: 0, y: 0, z: 1 }));
  const u = cross(r, f);
  return {
    width,
    height,
    cx: width / 2,
    cy: height * 0.5,
    focal: Math.min(width * 0.85, height * 0.95),
    pos,
    f,
    r,
    u,
  };
}

export function project(view, x, y, z = 0) {
  const dx = x - view.pos.x;
  const dy = y - view.pos.y;
  const dz = z - view.pos.z;
  const depth = dx * view.f.x + dy * view.f.y + dz * view.f.z;
  if (depth < 0.3) return null;
  const xc = dx * view.r.x + dy * view.r.y + dz * view.r.z;
  const yc = dx * view.u.x + dy * view.u.y + dz * view.u.z;
  return {
    x: view.cx + (xc / depth) * view.focal,
    y: view.cy - (yc / depth) * view.focal,
    depth,
    scale: view.focal / depth,
  };
}

// ---------------------------------------------------------------------------
// Cena: céu, chão, quadra e rede
// ---------------------------------------------------------------------------
function poly(ctx, points, fill, stroke = null, width = 1) {
  const pts = points.filter(Boolean);
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function line3(ctx, view, a, b, color = C.line, width = 2) {
  const pa = project(view, a.x, a.y, a.z ?? 0);
  const pb = project(view, b.x, b.y, b.z ?? 0);
  if (!pa || !pb) return;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function fillRect3(ctx, view, x0, x1, y0, y1, fill) {
  poly(
    ctx,
    [
      project(view, x0, y0, 0),
      project(view, x1, y0, 0),
      project(view, x1, y1, 0),
      project(view, x0, y1, 0),
    ],
    fill,
  );
}

export function drawSkyAndGround(ctx, view) {
  const sky = ctx.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, C.skyTop);
  sky.addColorStop(0.55, C.skyBottom);
  sky.addColorStop(1, C.groundFar);
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
    C.ground,
  );
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
export function racketWorldPosition(p, ball, swingPhase = null) {
  const bx = ball.x - p.x;
  const by = ball.y - p.y;
  const ballDist = Math.hypot(bx, by);
  const netDir = p.team === 'a' ? 1 : -1;
  let dirX = 0;
  let dirY = netDir;
  if (ballDist > 0.05 && ballDist < 5 && !ball.dead) {
    dirX = bx / ballDist;
    dirY = by / ballDist;
  }
  let reach = PLAYER.REACH * 0.7;
  let sweep = 0;
  if (swingPhase !== null) {
    sweep = (swingPhase - 0.5) * 1.6;
    reach = PLAYER.REACH * (0.55 + 0.4 * Math.sin(swingPhase * Math.PI));
  }
  const cos = Math.cos(sweep);
  const sin = Math.sin(sweep);
  // A raquete acompanha a altura da bola quando está encarando-a.
  const facingBall = ballDist > 0.05 && ballDist < 5 && !ball.dead;
  const z = facingBall ? Math.min(2.9, Math.max(0.25, ball.z)) : 0.8;
  return {
    x: p.x + (dirX * cos - dirY * sin) * reach,
    y: p.y + (dirX * sin + dirY * cos) * reach,
    z,
  };
}

function drawPlayer(ctx, view, p, world) {
  const feet = project(view, p.x, p.y, 0);
  const head = project(view, p.x, p.y, 1.75);
  if (!feet || !head) return;
  const h = Math.max(10, feet.y - head.y);
  const w = Math.max(9, h * 0.4);
  const color = p.team === 'a' ? C.a : C.b;

  // sombra
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y, w * 0.62, w * 0.26, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // Raquete sempre visível, encarando a bola; varre durante o golpe.
  const phase = p.swing
    ? Math.min(1, p.swing.t / (PLAYER.SWING_WINDUP + PLAYER.SWING_ACTIVE))
    : null;
  const racketPos = racketWorldPosition(p, world.ball, phase);
  const racket = project(view, racketPos.x, racketPos.y, racketPos.z);
  const dirX = racketPos.x - p.x;
  const dirY = racketPos.y - p.y;
  const dLen = Math.hypot(dirX, dirY) || 1;
  const grip = project(view, p.x + (dirX / dLen) * 0.12, p.y + (dirY / dLen) * 0.12, 0.8);

  if (racket && grip) {
    // cabo
    ctx.beginPath();
    ctx.moveTo(grip.x, grip.y);
    ctx.lineTo(racket.x, racket.y);
    ctx.strokeStyle = 'rgba(226,232,240,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // aro + cordas
    const rr = Math.max(4, w * 0.3);
    ctx.beginPath();
    ctx.ellipse(racket.x, racket.y, rr, rr * 1.12, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(racket.x - rr * 0.55, racket.y);
    ctx.lineTo(racket.x + rr * 0.55, racket.y);
    ctx.moveTo(racket.x, racket.y - rr * 0.6);
    ctx.lineTo(racket.x, racket.y + rr * 0.6);
    ctx.strokeStyle = 'rgba(15,23,42,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // corpo
  ctx.beginPath();
  ctx.moveTo(feet.x - w * 0.38, feet.y - h * 0.06);
  ctx.quadraticCurveTo(feet.x - w * 0.42, head.y + h * 0.28, head.x - w * 0.3, head.y + h * 0.22);
  ctx.lineTo(head.x + w * 0.3, head.y + h * 0.22);
  ctx.quadraticCurveTo(feet.x + w * 0.42, head.y + h * 0.28, feet.x + w * 0.38, feet.y - h * 0.06);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = p.human ? C.human : 'rgba(15,23,42,0.85)';
  ctx.lineWidth = p.human ? 2.5 : 2;
  ctx.stroke();

  // cabeça
  ctx.beginPath();
  ctx.arc(head.x, head.y + h * 0.08, w * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = p.human ? C.human : 'rgba(15,23,42,0.85)';
  ctx.lineWidth = p.human ? 2 : 1.5;
  ctx.stroke();

  // turbo disponível
  if (p.turbo >= 30) {
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y, w * 0.75, w * 0.3, 0, -Math.PI / 2, -Math.PI / 2 + (p.turbo / 100) * Math.PI * 2);
    ctx.strokeStyle = 'rgba(167,139,250,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Vigor (stamina): barra sob os pés. A barra da IA é menor e mais discreta.
  const barW = Math.max(p.human ? 30 : 18, w * (p.human ? 1.8 : 1.05));
  const barH = p.human ? 4 : 3;
  const sx = feet.x - barW / 2;
  const sy = feet.y + 8;
  drawIcon(
    ctx,
    icon('stamina'),
    sx - (p.human ? 11 : 8),
    sy + barH / 2,
    p.human ? 14 : 10,
    p.human ? 0.95 : 0.55,
  );
  ctx.globalAlpha = p.human ? 1 : 0.65;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(sx - 1, sy - 1, barW + 2, barH + 2);
  ctx.fillStyle = p.sprinting ? '#22d3ee' : p.stamina > STAMINA.LOW ? '#38bdf8' : '#f87171';
  ctx.fillRect(sx, sy, barW * (p.stamina / (p.staminaMax ?? 100)), barH);
  ctx.globalAlpha = 1;

  // barra de carga (no saque, a primeira barra é o toss)
  if (p.charging || p.charge > 0.01) {
    const bw = Math.max(26, w * 1.6);
    const bx2 = head.x - bw / 2;
    const by2 = head.y - 14;
    const isServer =
      world && world.serve && world.serve.serverId === p.id && world.phase === 'serve';
    const tossing = isServer && world.serve.stage !== 'hit';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx2 - 1, by2 - (tossing ? 5 : 1), bw + 2, tossing ? 16 : 7);
    ctx.fillStyle = p.charge >= 0.75 ? '#a78bfa' : p.charge > 0.45 ? '#fbbf24' : '#4ade80';
    ctx.fillRect(bx2, by2, bw * p.charge, 5);
    if (tossing) {
      // Área do toss (90%+, 0,6 a 0,9) e área interna de 100%, que cresce com o
      // stat de saque do jogador.
      const zx = bx2 + bw * SERVE.TOSS_IDEAL_MIN;
      const zw = bw * (SERVE.TOSS_IDEAL_MAX - SERVE.TOSS_IDEAL_MIN);
      ctx.strokeStyle = 'rgba(74,222,128,0.95)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(zx + 0.5, by2 - 1.5, zw - 1, 8);
      const stat = p.stats?.serve ?? 75;
      const k = clamp((stat - 50) / 49, 0, 1);
      const innerHalf =
        SERVE.TOSS_PERFECT_MIN + (SERVE.TOSS_PERFECT_MAX - SERVE.TOSS_PERFECT_MIN) * k;
      const center = (SERVE.TOSS_IDEAL_MIN + SERVE.TOSS_IDEAL_MAX) / 2;
      const ix = bx2 + bw * (center - innerHalf);
      const iw = Math.max(3, bw * innerHalf * 2);
      ctx.fillStyle = 'rgba(248,250,252,0.92)';
      ctx.fillRect(ix, by2 - 4, iw, 13);
      ctx.strokeStyle = 'rgba(74,222,128,1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ix + 0.5, by2 - 3.5, Math.max(2, iw - 1), 12);
    }
  }
}

// Estágio 2 do saque: sem gauge. O rótulo perto da bola indica a hora
// (SEGURE enquanto a bola sobe, BATA na zona de contato, TARDE se passou) e um
// aro verde na própria bola marca o momento certo.
function drawServeContact(ctx, view, world) {
  const s = world.serve;
  if (world.phase !== 'serve' || s.inFlight || !s.toss) return;
  const ball = world.ball;
  const at = project(view, ball.x, ball.y, ball.z);
  if (!at) return;
  const descending = ball.vz < 0;
  const half = SERVE.CONTACT_TOLERANCE * 0.5;
  const inBand = descending && Math.abs(ball.z - s.toss.idealZ) <= half;
  const missed = descending && ball.z < s.toss.idealZ - half;
  const label = inBand
    ? t('hud.serveRelease')
    : missed
      ? t('hud.serveLate')
      : t('hud.serveWait');
  const color = inBand ? '#4ade80' : missed ? '#f87171' : 'rgba(229,231,235,0.85)';
  const r = Math.max(6, 0.09 * at.scale);
  if (inBand) {
    ctx.beginPath();
    ctx.arc(at.x, at.y, r * 1.9, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(74,222,128,0.95)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const ty = at.y - Math.max(20, 0.16 * at.scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(2,6,23,0.8)';
  ctx.strokeText(label, at.x, ty);
  ctx.fillStyle = color;
  ctx.fillText(label, at.x, ty);
  // Qualidade do toss perto do sacador.
  const srv = world.byId[s.toss.playerId];
  const sp = srv ? project(view, srv.x, srv.y, 2.6) : null;
  if (sp) {
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(229,231,235,0.7)';
    ctx.fillText(t('hud.serveToss', { pct: Math.round((s.toss.quality ?? 0) * 100) }), sp.x, sp.y);
  }
}

// Impactos de raquete e etiquetas do tipo de batida.
function drawEffects(ctx, view, world, fx) {
  for (const im of fx.impacts ?? []) {
    const k = 1 - im.life / im.max;
    const p = project(view, im.x, im.y, im.z ?? 0.6);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(4, (0.12 + k * 0.35) * p.scale), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${im.rgb ?? '255,255,255'},${0.85 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, 0.05 * p.scale), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${im.rgb ?? '255,255,255'},${0.6 * (1 - k)})`;
    ctx.fill();
  }
  for (const lb of fx.labels ?? []) {
    const player = world.byId[lb.playerId];
    if (!player) continue;
    const k = lb.life / lb.max;
    const p = project(view, player.x, player.y, 2.2);
    if (!p) continue;
    const alpha = Math.min(1, k * 1.6);
    const size = Math.max(26, 0.9 * p.scale);
    const drawn = lb.action ? drawIcon(ctx, actionIcon(lb.action, lb.hand), p.x, p.y, size, alpha) : false;
    if (drawn) {
      if (lb.turbo) {
        drawIcon(
          ctx,
          actionIcon('turbo', lb.hand),
          p.x + size * 0.72,
          p.y - size * 0.46,
          size * 0.6,
          alpha,
        );
      }
      if (lb.caption) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillStyle = `rgba(${lb.rgb ?? '255,255,255'},${alpha})`;
        ctx.fillText(lb.caption, p.x, p.y + size * 0.78);
      }
    } else {
      // Sem ícone carregado (ou em teste): mantém o rótulo em texto.
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillStyle = `rgba(${lb.rgb ?? '255,255,255'},${alpha})`;
      ctx.fillText(lb.text ?? '', p.x, p.y);
    }
  }
}

function drawBall(ctx, view, ball, fx) {
  // rastro
  for (const tr of fx.trail) {
    const a = Math.max(0, tr.life / tr.max);
    const p = project(view, tr.x, tr.y, tr.z);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, 0.05 * p.scale) * a, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${tr.rgb ?? '253,224,71'},${0.3 * a})`;
    ctx.fill();
  }
  // marcas de quique
  for (const m of fx.marks) {
    const k = 1 - m.life / m.max;
    const p = project(view, m.x, m.y, 0);
    if (!p) continue;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 0.12 * p.scale + k * 0.2 * p.scale, (0.12 * p.scale + k * 0.2 * p.scale) * 0.42, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // sombra no chão
  const shadow = project(view, ball.x, ball.y, 0);
  if (shadow) {
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, 0.075 * shadow.scale, 0.032 * shadow.scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();
  }
  // bola (com altura real)
  const p = project(view, ball.x, ball.y, Math.max(ball.z, 0.02));
  if (!p) return;
  const r = Math.max(3.2, Math.min(14, 0.09 * p.scale));
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.ball;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(2,6,23,0.72)';
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function drawScoreboard(ctx, v, world) {
  const s = world.score;
  const W = Math.min(v.width - 40, 760);
  const x0 = (v.width - W) / 2;
  const y = 12;
  const h = 74;
  const wTeam = (W - 150) / 2;
  panel(ctx, x0, y, W, h);
  ctx.textBaseline = 'middle';

  const drawTeam = (team, x) => {
    const name = teamName(world, team);
    const color = team === 'a' ? C.a : C.b;
    ctx.textAlign = 'left';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(name, x + 14, y + 22);
    if (s.server === team) {
      ctx.beginPath();
      ctx.arc(x + 10, y + 22, 4, 0, Math.PI * 2);
      ctx.fillStyle = C.ball;
      ctx.fill();
    }
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(s.pointsLabel(team), x + 14, y + 52);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(t('hud.sets'), x + 62, y + 45);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(s.setsWon[team]), x + 66, y + 63);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(t('hud.games'), x + 96, y + 45);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(s.games[team]), x + 104, y + 63);
  };
  drawTeam('a', x0 + 8);
  drawTeam('b', x0 + 8 + wTeam + 150 + 8);

  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  const setNo = s.sets.length + 1;
  const setLabel = t('hud.set', { n: Math.min(setNo, s.sets.length + (s.winner ? 0 : 1)) });
  ctx.fillText(`${t('hud.bestOf', { n: s.bestOf })}  •  ${setLabel}`, x0 + W / 2, y + 24);
  if (s.tiebreak) {
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#fbbf24';
    const tbText = t('hud.tiebreak', { a: s.tbPoints.a, b: s.tbPoints.b });
    const tbW = ctx.measureText(tbText).width;
    drawIcon(ctx, icon('tiebreak'), x0 + W / 2 - tbW / 2 - 17, y + 52, 24, 1);
    ctx.fillText(tbText, x0 + W / 2, y + 52);
  } else {
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(`${s.games.a} - ${s.games.b}`, x0 + W / 2, y + 52);
  }
}

function drawMessage(ctx, v, world, fx) {
  if (world.message && world.messageTimer > 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const scale = 1 + Math.min(0.12, fx.shake * 0.01);
    ctx.save();
    ctx.translate(v.cx, v.height * 0.78);
    ctx.scale(scale, scale);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(2,6,23,0.85)';
    ctx.strokeText(world.message, 0, 0);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(world.message, 0, 0);
    ctx.restore();
  }
  if (world.phase === 'serve' && !world.serve.inFlight && world.serve.toss) {
    // Estágio 2: o humano segura de novo e solta no alto.
    const srv = world.byId[world.serve.toss.playerId];
    if (srv && srv.human) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(229,231,235,0.85)';
      ctx.fillText(t('hud.serveHitHint'), v.cx, v.height * 0.86);
    }
  }
  if (world.phase === 'serve' && !world.serve.inFlight && !world.serve.toss) {
    const srv = world.byId[world.serve.serverId];
    if (srv && srv.human) {
      const keys = t(srv.id === 'a1' ? 'hud.serveKeys.p1' : 'hud.serveKeys.p2');
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(229,231,235,0.85)';
      ctx.fillText(t('hud.serveHint', { keys }), v.cx, v.height * 0.86);
    }
  }
}

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------
// Mira do saque: mostra onde a bola vai cair (para o sacador humano).
function drawServeAim(ctx, view, world) {
  if (world.phase !== 'serve' || world.serve.inFlight) return;
  const server = world.byId[world.serve.serverId];
  if (!server || !server.human) return;
  const type = server.charging ? server.chargeShot ?? 'flat' : 'flat';
  const target = serveAimTarget(world, server, type);
  const p = project(view, target.x, target.y, 0);
  if (!p) return;
  const r = Math.max(6, 0.24 * p.scale);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(253,224,71,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p.x - r * 0.45, p.y);
  ctx.lineTo(p.x + r * 0.45, p.y);
  ctx.moveTo(p.x, p.y - r * 0.22);
  ctx.lineTo(p.x, p.y + r * 0.22);
  ctx.strokeStyle = 'rgba(253,224,71,0.75)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function drawMatch(ctx, world, v, fx) {
  ctx.save();
  if (fx.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  }
  drawSkyAndGround(ctx, v);
  drawCourt(ctx, v, world.surface);
  drawServeAim(ctx, v, world);
  drawServeContact(ctx, v, world);

  // Ordena por profundidade: mais longe primeiro (a rede fica no meio).
  const items = [];
  for (const p of world.players) {
    const at = project(v, p.x, p.y, 0);
    items.push({ depth: at ? at.depth : 0, draw: () => drawPlayer(ctx, v, p, world) });
  }
  const netAt = project(v, 0, 0, 0.9);
  items.push({ depth: netAt ? netAt.depth : 0, draw: () => drawNet(ctx, v) });
  const ballAt = project(v, world.ball.x, world.ball.y, world.ball.z);
  items.push({ depth: ballAt ? ballAt.depth : 0, draw: () => drawBall(ctx, v, world.ball, fx) });
  items.sort((a, b) => b.depth - a.depth);
  for (const item of items) item.draw();
  drawEffects(ctx, v, world, fx);
  ctx.restore();

  drawScoreboard(ctx, v, world);
  drawMessage(ctx, v, world, fx);
  drawSetSummary(ctx, v, world);
  // Marca discreta no canto da quadra.
  drawContain(ctx, media.logoShort, v.width - 54, v.height - 54, 62, 62, 0.25);
  if (world.phase === 'matchover') drawGameOver(ctx, v, world);
}

export function drawGameOver(ctx, v, world) {
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
export function modeSlots(modeId) {
  return (MODES[modeId] ?? MODES.singles).players;
}

export function defaultSlotConfig(slot) {
  // Humano começa equilibrado; a CPU sorteia a classe a cada partida.
  return slot.human ? { classId: 'balanced' } : { classId: 'random' };
}

export function slotConfig(menu, slot) {
  return menu.players?.config?.[slot.id] ?? defaultSlotConfig(slot);
}

export function classLabel(classId) {
  if (classId === 'random') return t('players.random');
  if (classId === 'custom') return t('players.custom');
  return CLASSES[classId] ? t(`class.${classId}`) : t('class.balanced');
}

export function slotLabel(slots, index) {
  const slot = slots[index];
  const humans = slots.slice(0, index + 1).filter((s) => s.human).length;
  const cpus = slots.slice(0, index + 1).filter((s) => !s.human).length;
  return slot.human ? `P${humans}` : `${t('players.cpu')} ${cpus}`;
}

export function playerStats(menu, slot) {
  const cfg = slotConfig(menu, slot);
  if (cfg.classId === 'custom' && cfg.stats) return cfg.stats;
  return CLASSES[cfg.classId] ?? CLASSES.balanced;
}

function statColor(value) {
  if (value >= 85) return '#38bdf8';
  if (value >= 70) return '#4ade80';
  if (value >= 60) return '#fbbf24';
  return '#f87171';
}

function statRow(ctx, x, y, w, label, value) {
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
  drawSkyAndGround(ctx, v);
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
const STAT_ROWS = [
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

function statsShotsLine(stats) {
  return t('stats.shotsLine', {
    flat: stats.shots.flat,
    topspin: stats.shots.topspin,
    slice: stats.shots.slice,
    lob: stats.shots.lob,
  });
}

function drawStatsTable(ctx, v, top, columns) {
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
  ctx.fillText(statsShotsLine(stats), v.cx, y0 + h - 14);
}

// ---------------------------------------------------------------------------
// Carregando: mostra o tipo de jogador, o modo e o formato antes da partida
// ---------------------------------------------------------------------------
export function drawLoading(ctx, v, world, menu, progress = 0) {
  if (imageReady(media.landing)) {
    drawCover(ctx, media.landing, v.width, v.height);
  } else {
    drawSkyAndGround(ctx, v);
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
    `${t('loading.format')}: ${BEST_OF_ORDER[menu.bestOfIndex] === 1 ? t('menu.bestOf1') : t('menu.bestOf3')}`,
    `${t('loading.difficulty')}: ${difficultyLabel(menu.difficultyIndex)}`,
    `${t('loading.surface')}: ${t(`surface.${world.surface ?? 'hard'}`)}`,
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

export const MODE_ORDER = ['coop', 'singles', 'versus', 'demo'];
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'unfair', 'impossible'];
export function difficultyLabel(index) {
  return t(`difficulty.${DIFFICULTY_ORDER[index] ?? 'easy'}`);
}
export const BEST_OF_ORDER = [1, 3];

export const modeLabel = (id) => t(`mode.${id}.label`);
export const modeSub = (id) => t(`mode.${id}.sub`);

// Itens do menu: 4 modos + dificuldade + partida + ajuda.
export function menuRows(menu) {
  const rows = MODE_ORDER.map((id) => ({
    kind: 'mode',
    modeId: id,
    label: modeLabel(id),
    sub: modeSub(id),
  }));
  rows.push({
    kind: 'difficulty',
    label: t('menu.difficulty'),
    sub: difficultyLabel(menu.difficultyIndex),
  });
  rows.push({
    kind: 'bestOf',
    label: t('menu.match'),
    sub: (BEST_OF_ORDER[menu.bestOfIndex] ?? 1) === 1 ? t('menu.bestOf1') : t('menu.bestOf3'),
  });
  rows.push({
    kind: 'language',
    label: t('menu.language'),
    sub: t(`lang.${LANG_ORDER[menu.langIndex ?? 0] ?? 'pt'}`),
  });
  rows.push({
    kind: 'surface',
    label: t('menu.surface'),
    sub: t(`surface.${SURFACE_ORDER[menu.surfaceIndex ?? 0] ?? 'hard'}`),
  });
  rows.push({
    kind: 'players',
    label: t('menu.players'),
    sub: t('menu.playersSub'),
  });
  rows.push({
    kind: 'help',
    label: t('menu.help'),
    sub: t('menu.helpSub'),
  });
  // O teclado só emite Digit0 a Digit9: as 9 primeiras linhas ganham atalho
  // numérico (o resto é alcançado com as setas).
  rows.forEach((row, i) => {
    if (i < 9) row.key = String(i + 1);
    else delete row.key;
  });
  return rows;
}

export function drawMenu(ctx, v, menu) {
  const surface = SURFACE_ORDER[menu.surfaceIndex ?? 0] ?? 'hard';
  if (imageReady(media.landing)) {
    // Fundo: cena de marca (landing.png) com escurecida para o texto legível.
    drawCover(ctx, media.landing, v.width, v.height);
    const grad = ctx.createLinearGradient(0, 0, 0, v.height);
    grad.addColorStop(0, 'rgba(2,6,23,0.62)');
    grad.addColorStop(0.45, 'rgba(2,6,23,0.3)');
    grad.addColorStop(1, 'rgba(2,6,23,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, v.width, v.height);
  } else {
    drawSkyAndGround(ctx, v);
    drawCourt(ctx, v, surface);
    drawNet(ctx, v);
    ctx.fillStyle = 'rgba(2,6,23,0.62)';
    ctx.fillRect(0, 0, v.width, v.height);
  }

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
    const y = top + i * step;
    const focused = i === focus;
    const selected = row.kind === 'mode' && MODE_ORDER[menu.modeIndex] === row.modeId;
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
    const prefix = row.key ? `${row.key}  ` : '';
    ctx.fillText(`${prefix}${row.label}`, x0 + 20, y - 2);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(row.sub, x0 + (row.key ? 58 : 150), y + step * 0.24);
    if (row.kind === 'surface') {
      // Prévia da quadra: aparece mesmo com a imagem de fundo carregada.
      const sw = ctx.measureText(row.sub).width;
      const colors = SURFACE_COLORS[surface] ?? SURFACE_COLORS.hard;
      ctx.fillStyle = colors.court;
      roundRect(ctx, x0 + (row.key ? 58 : 150) + sw + 10, y + step * 0.24 - 8, 16, 16, 4);
      ctx.fill();
    }
    if (
      focused &&
      (row.kind === 'difficulty' ||
        row.kind === 'bestOf' ||
        row.kind === 'language' ||
        row.kind === 'surface')
    ) {
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillStyle = C.ball;
      ctx.textAlign = 'right';
      ctx.fillText(t('menu.qe'), x0 + boxW - 18, y - 2);
    } else if (focused && row.kind === 'mode') {
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(253,224,71,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText('◀ ▶', x0 + boxW - 18, y - 2);
    } else if (focused && (row.kind === 'help' || row.kind === 'players')) {
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
  });

  const hintY = top + rows.length * step + 14;
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(t('menu.hint'), v.cx, hintY);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(229,231,235,0.55)';
  ctx.fillText(t('menu.controlsHint'), v.cx, Math.min(hintY + 24, v.height - 16));
}

// Tela "Como jogar": controles, batidas, saque e regras.
export function drawHelp(ctx, v) {
  ctx.fillStyle = '#07211a';
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.fillStyle = 'rgba(2,6,23,0.55)';
  ctx.fillRect(0, 0, v.width, v.height);
  drawContain(ctx, media.logoShort, v.width - 66, 56, 88, 88, 0.9);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText(t('help.title'), v.cx, Math.min(52, v.height * 0.08));

  const columns = [
    [
      {
        title: t('help.controls.title'),
        lines: [
          t('help.controls.p1'),
          t('help.controls.p2'),
          t('help.controls.menu'),
          t('help.controls.game'),
        ],
      },
      {
        title: t('help.shots.title'),
        lines: [
          { icon: 'shot-flat', text: t('help.shots.flat') },
          { icon: 'shot-topspin', text: t('help.shots.topspin') },
          { icon: 'shot-slice', text: t('help.shots.slice') },
          { icon: 'shot-lob', text: t('help.shots.lob') },
          t('help.shots.hand'),
          { icon: 'turbo', text: t('help.shots.turbo') },
        ],
      },
      {
        title: t('help.serve.title'),
        lines: [
          { icon: 'serve-flat', text: t('help.serve.flat') },
          { icon: 'serve-flat-plus', text: t('help.serve.power') },
          t('help.serve.release'),
          t('help.serve.fault'),
          t('help.serve.let'),
        ],
      },
    ],
    [
      {
        title: t('help.strokes.title'),
        lines: [
          t('help.strokes.forehand'),
          t('help.strokes.backhand'),
          t('help.strokes.volley'),
          t('help.strokes.smash'),
          t('help.strokes.halfvolley'),
          t('help.strokes.return'),
        ],
      },
      {
        title: t('help.score.title'),
        lines: [
          t('help.score.points'),
          t('help.score.game'),
          t('help.score.set'),
          { icon: 'tiebreak', text: t('help.score.tiebreak') },
          t('help.score.match'),
        ],
      },
      {
        title: t('help.rules.title'),
        lines: [
          t('help.rules.bounce'),
          { icon: 'net', text: t('help.rules.out') },
          t('help.rules.double'),
          t('help.rules.receiver'),
          t('help.rules.partner'),
          t('help.rules.ends'),
          { icon: 'stamina', text: t('help.rules.stamina') },
        ],
      },
    ],
  ];

  // Duas colunas de largura fixa, uma de cada lado do centro, com margem.
  const colW = Math.min(560, (v.width - 64) / 2);
  const x1 = v.cx - colW - 16;
  const x2 = v.cx + 16;
  const top = Math.min(110, v.height * 0.18);
  const lineH = Math.min(24, v.height * 0.032);

  const drawColumn = (sections, x) => {
    let y = top;
    for (const section of sections) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = C.ball;
      ctx.fillText(section.title, x, y);
      y += lineH * 0.9;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = C.text;
      for (const line of section.lines) {
        const entry = typeof line === 'string' ? { text: line } : line;
        if (entry.icon) {
          drawIcon(ctx, icon(entry.icon), x + 9, y, 20, 0.95);
          ctx.fillStyle = C.text;
          ctx.fillText(entry.text, x + 24, y);
        } else {
          ctx.fillText(`- ${entry.text}`, x, y);
        }
        y += lineH;
      }
      y += lineH * 0.55;
    }
  };
  drawColumn(columns[0], x1);
  drawColumn(columns[1], x2);

  ctx.textAlign = 'center';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(t('help.back'), v.cx, v.height - 24);
}
