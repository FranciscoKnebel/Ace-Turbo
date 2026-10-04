import { COURT, PLAYER } from './sim/constants.js';
import { serveAimTarget } from './sim/world.js';
import { drawContain, drawCover, imageReady, media } from './media.js';

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

const NAMES = {
  coop: ['VOCÊS', 'CPUs'],
  singles: ['VOCÊ', 'CPU'],
  versus: ['P1', 'P2'],
  demo: ['CPU A', 'CPU B'],
};

// Nome do lado. No modo versus os jogadores trocam de lado, então o nome segue
// o jogador (P1/P2), não a metade da quadra.
function teamName(world, team) {
  if (world.mode === 'versus') {
    const human = world.players.find((p) => p.team === team && p.human);
    return human && human.id === 'a1' ? 'P1' : 'P2';
  }
  return (NAMES[world.mode] ?? NAMES.singles)[team === 'a' ? 0 : 1];
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

export function drawCourt(ctx, view) {
  const hw = COURT.DOUBLES_HALF_WIDTH;
  const hl = COURT.HALF_LENGTH;
  // área de duplas
  fillRect3(ctx, view, -hw, hw, -hl, hl, C.court);
  // caixas de serviço
  fillRect3(ctx, view, -COURT.SINGLES_HALF_WIDTH, COURT.SINGLES_HALF_WIDTH, -COURT.SERVICE_LINE, COURT.SERVICE_LINE, C.courtAlt);

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
  ctx.globalAlpha = p.human ? 1 : 0.65;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(sx - 1, sy - 1, barW + 2, barH + 2);
  ctx.fillStyle = p.sprinting ? '#22d3ee' : p.stamina > 25 ? '#38bdf8' : '#f87171';
  ctx.fillRect(sx, sy, barW * (p.stamina / 100), barH);
  ctx.globalAlpha = 1;

  // barra de carga
  if (p.charging || p.charge > 0.01) {
    const bw = Math.max(26, w * 1.6);
    const bx2 = head.x - bw / 2;
    const by2 = head.y - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx2 - 1, by2 - 1, bw + 2, 7);
    ctx.fillStyle = p.charge >= 0.75 ? '#a78bfa' : p.charge > 0.45 ? '#fbbf24' : '#4ade80';
    ctx.fillRect(bx2, by2, bw * p.charge, 5);
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
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = `rgba(${lb.rgb ?? '255,255,255'},${Math.min(1, k * 1.6)})`;
    ctx.fillText(lb.text, p.x, p.y);
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
    ctx.fillText('SETS', x + 62, y + 45);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(s.setsWon[team]), x + 66, y + 63);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText('GAMES', x + 96, y + 45);
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
  ctx.fillText(
    `MELHOR DE ${s.bestOf}  •  SET ${Math.min(setNo, s.sets.length + (s.winner ? 0 : 1))}`,
    x0 + W / 2,
    y + 24,
  );
  if (s.tiebreak) {
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`TIEBREAK ${s.tbPoints.a}-${s.tbPoints.b}`, x0 + W / 2, y + 52);
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
  if (world.phase === 'serve' && !world.serve.inFlight && !world.serve.toss) {
    const srv = world.byId[world.serve.serverId];
    if (srv && srv.human) {
      const keys = srv.id === 'a1' ? 'ESPAÇO (flat) / J / K / L' : 'ENTER (flat) / , / . / /';
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(229,231,235,0.85)';
      ctx.fillText(
        `SEGURE ${keys} • MIRE COM AS DIREÇÕES • SOLTE: LANÇA A BOLA E BATE • SHIFT CORRE`,
        v.cx,
        v.height * 0.86,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------
// Mira do saque: mostra onde a bola vai cair (para o sacador humano).
function drawServeAim(ctx, view, world) {
  if (world.phase !== 'serve' || world.serve.inFlight || world.serve.toss) return;
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
  drawCourt(ctx, v);
  drawServeAim(ctx, v, world);

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
  // Marca discreta no canto da quadra.
  drawContain(ctx, media.logoShort, v.width - 54, v.height - 54, 62, 62, 0.25);
  if (world.phase === 'matchover') drawGameOver(ctx, v, world);
}

export function drawGameOver(ctx, v, world) {
  ctx.fillStyle = 'rgba(2,6,23,0.66)';
  ctx.fillRect(0, 0, v.width, v.height);
  drawContain(ctx, media.logoShort, v.cx, v.cy - 165, 140, 140, 0.92);
  const team = world.score.winner;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillStyle = team === 'a' ? C.a : C.b;
  ctx.fillText(`VITÓRIA: ${teamName(world, team)}`, v.cx, v.cy - 40);
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  const sets = world.score.sets.map((s) => `${s.a}-${s.b}`).join('  ');
  ctx.fillText(`Sets: ${sets}`, v.cx, v.cy + 20);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText('[R] REVANCHE     [M] MENU', v.cx, v.cy + 70);
}

export function drawPause(ctx, v) {
  ctx.fillStyle = 'rgba(2,6,23,0.7)';
  ctx.fillRect(0, 0, v.width, v.height);
  drawContain(ctx, media.logoShort, v.cx, v.cy - 130, 128, 128, 0.9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText('PAUSADO', v.cx, v.cy - 30);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText('[ESC/P] CONTINUAR     [R] REINICIAR     [M] MENU', v.cx, v.cy + 30);
}

export const MODE_ORDER = ['coop', 'singles', 'versus', 'demo'];
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'unfair', 'impossible'];
export const DIFFICULTY_LABEL = {
  easy: 'Fácil',
  normal: 'Normal',
  hard: 'Difícil',
  unfair: 'Injusto',
  impossible: 'Impossível',
};
export const BEST_OF_ORDER = [1, 3];

export const MODE_LABEL = {
  coop: 'Co-op Duplas',
  singles: 'Simples',
  versus: 'Versus',
  demo: 'Demo (CPU vs CPU)',
};
export const MODE_SUB = {
  coop: 'P1 + P2 vs 2 CPUs',
  singles: '1 jogador vs CPU',
  versus: 'P1 vs P2 no mesmo teclado',
  demo: 'assistir CPU vs CPU',
};

// Itens do menu: 4 modos + dificuldade + partida + ajuda.
export function menuRows(menu) {
  const rows = MODE_ORDER.map((id, i) => ({
    kind: 'mode',
    modeId: id,
    key: String(i + 1),
    label: MODE_LABEL[id],
    sub: MODE_SUB[id],
  }));
  rows.push({
    kind: 'difficulty',
    key: '5',
    label: 'Dificuldade',
    sub: DIFFICULTY_LABEL[DIFFICULTY_ORDER[menu.difficultyIndex]] ?? 'Fácil',
  });
  rows.push({
    kind: 'bestOf',
    key: '6',
    label: 'Partida',
    sub: (BEST_OF_ORDER[menu.bestOfIndex] ?? 1) === 1 ? '1 set (rápida)' : 'melhor de 3 sets',
  });
  rows.push({
    kind: 'help',
    key: '7',
    label: 'Como jogar',
    sub: 'controles, batidas, saque e regras',
  });
  return rows;
}

export function drawMenu(ctx, v, menu) {
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
    drawCourt(ctx, v);
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
  ctx.fillText('Tênis em 3D • Regras oficiais • Co-op de duplas', v.cx, Math.min(120, v.height * 0.175));

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
    if (focused && (row.kind === 'difficulty' || row.kind === 'bestOf')) {
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillStyle = C.ball;
      ctx.textAlign = 'right';
      ctx.fillText('Q ◀ ▶ E', x0 + boxW - 18, y - 2);
    } else if (focused && row.kind === 'mode') {
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(253,224,71,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText('◀ ▶', x0 + boxW - 18, y - 2);
    } else if (focused && row.kind === 'help') {
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(253,224,71,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText('ENTER', x0 + boxW - 18, y - 2);
    }
    if (selected) {
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillStyle = C.ball;
      ctx.textAlign = 'right';
      ctx.fillText('▶', x0 + boxW - (focused ? 92 : 18), y - 2);
    }
  });

  const hintY = top + rows.length * step + 14;
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText('↑ ↓ escolhe a opção      1 a 7 atalho      Q / E altera      ENTER confirma', v.cx, hintY);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(229,231,235,0.55)';
  ctx.fillText(
    'P1: WASD move • ESPAÇO flat • J top spin • K slice • L lob      P2: setas • ENTER flat • , . /',
    v.cx,
    Math.min(hintY + 24, v.height - 16),
  );
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
  ctx.fillText('COMO JOGAR', v.cx, Math.min(52, v.height * 0.08));

  const columns = [
    [
      {
        title: 'CONTROLES',
        lines: [
          'P1: WASD move • Shift corre • Espaço flat • J top spin • K slice • L lob',
          'P2: setas move • Shift direito corre • Enter flat • , top spin • . slice • / lob',
          'Menu: ↑↓ escolhe • 1-7 atalho • Q/E altera • Enter confirma',
          'No jogo: R reinicia • P/Esc pausa • M volta ao menu',
        ],
      },
      {
        title: 'BATIDAS (segure e solte perto da bola)',
        lines: [
          'Flat: segura, profundidade e quique normais',
          'Top spin: mais funda e quica alto, com mais risco',
          'Slice: mais lenta, com quique baixo e curva lateral',
          'Lob: aérea, alta e profunda',
          'Forehand (lado da mão) e backhand (lado oposto)',
          'Turbo: carga alta + reserva = golpe mais rápido',
        ],
      },
      {
        title: 'SAQUE (mesmas teclas escolhem o tipo)',
        lines: [
          'Flat: rápido • Kick: quica alto • Slice: baixo e aberto',
          'Lob: alto e seguro (bom para o 2º saque)',
          'Solte a tecla: a bola sobe e é batida no alto',
          'Falta no 1º e 2º saque; duas faltas = ponto do recebedor',
          'Let: toca a rede e cai na caixa, o saque repete',
        ],
      },
    ],
    [
      {
        title: 'GOLPES FUNDAMENTAIS',
        lines: [
          'Forehand: do lado dominante, palma da mão para a frente',
          'Backhand: do lado oposto, costas da mão para o alvo',
          'Voleio: curto e firme, antes do quique, perto da rede',
          'Smash: por cima da cabeça, resposta a lob alto',
          'Meio-voleio: logo após o quique, quase no chão, defensivo',
          'Devolução: primeiro golpe de fundo no retorno do saque',
        ],
      },
      {
        title: 'PONTUAÇÃO',
        lines: [
          '0 / 15 / 30 / 40, deuce (40-40) e vantagem (AD)',
          'Game: 4 pontos com 2 de diferença',
          'Set: 6 games com 2 de diferença; 6-6 vai a tiebreak',
          'Tiebreak: 7 pontos, saque alternando 1-2-2-2',
          'Partida de 1 set ou melhor de 3 (menu)',
        ],
      },
      {
        title: 'REGRAS E EXTRAS',
        lines: [
          'Um quique por lado; o segundo quique perde o ponto',
          'Bola fora ou na rede do seu lado = ponto do adversário',
          'Um time não bate duas vezes seguidas; não cruze a rede',
          'Em duplas, a devolução é sempre do recebedor designado',
          'Bola no parceiro antes de cruzar/quicar perde o ponto',
          'Versus: troca de lado a cada game ímpar',
          'Vigor: Shift corre mais rápido e recarrega parado',
        ],
      },
    ],
  ];

  const colW = Math.min(520, (v.width - 80) / 2);
  const x1 = v.cx - colW / 2 - 12;
  const x2 = v.cx + colW / 2 + 12;
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
        ctx.fillText(`- ${line}`, x, y);
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
  ctx.fillText('ESC ou ENTER para voltar ao menu', v.cx, v.height - 24);
}
