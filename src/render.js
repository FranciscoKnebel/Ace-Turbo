import { COURT, DIFFICULTY, PLAYER } from './sim/constants.js';
import { sideOf } from './sim/ai.js';

const C = {
  bg: '#07211a',
  surround: '#0b3b2c',
  court: '#1b4f97',
  courtAlt: '#215ba9',
  line: 'rgba(255,255,255,0.92)',
  net: '#0f172a',
  netBand: '#e2e8f0',
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

export function computeView(width, height) {
  const s = Math.min(
    (width - 90) / (COURT.HALF_LENGTH * 2 + 5),
    (height - 165) / (COURT.DOUBLES_HALF_WIDTH * 2 + 4),
  );
  return { s: Math.max(6, s), cx: width / 2, cy: height / 2 + 14, width, height };
}

const sx = (v, y) => v.cx + y * v.s;
const sy = (v, x) => v.cy + x * v.s;

function courtPath(ctx, v) {
  // retângulo de duplas
  ctx.beginPath();
  ctx.rect(sx(v, -COURT.HALF_LENGTH), sy(v, -COURT.DOUBLES_HALF_WIDTH), COURT.HALF_LENGTH * 2 * v.s, COURT.DOUBLES_HALF_WIDTH * 2 * v.s);
  ctx.fillStyle = C.court;
  ctx.fill();
}

function line(ctx, v, y1, x1, y2, x2, width = 2, color = C.line) {
  ctx.beginPath();
  ctx.moveTo(sx(v, y1), sy(v, x1));
  ctx.lineTo(sx(v, y2), sy(v, x2));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawCourt(ctx, v) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, v.width, v.height);

  // entorno
  ctx.fillStyle = C.surround;
  ctx.beginPath();
  ctx.rect(
    sx(v, -(COURT.HALF_LENGTH + 3.2)),
    sy(v, -(COURT.DOUBLES_HALF_WIDTH + 2.2)),
    (COURT.HALF_LENGTH * 2 + 6.4) * v.s,
    (COURT.DOUBLES_HALF_WIDTH * 2 + 4.4) * v.s,
  );
  ctx.fill();

  courtPath(ctx, v);

  // caixas de serviço um pouco mais claras
  ctx.fillStyle = C.courtAlt;
  ctx.fillRect(sx(v, -COURT.SERVICE_LINE), sy(v, -COURT.SINGLES_HALF_WIDTH), COURT.SERVICE_LINE * 2 * v.s, COURT.SINGLES_HALF_WIDTH * 2 * v.s);

  // linhas
  const hw = COURT.DOUBLES_HALF_WIDTH;
  const sw = COURT.SINGLES_HALF_WIDTH;
  const hl = COURT.HALF_LENGTH;
  line(ctx, v, -hl, -hw, hl, -hw);
  line(ctx, v, -hl, hw, hl, hw);
  line(ctx, v, -hl, -sw, hl, -sw);
  line(ctx, v, -hl, sw, hl, sw);
  line(ctx, v, -hl, -hw, -hl, hw);
  line(ctx, v, hl, -hw, hl, hw);
  line(ctx, v, -COURT.SERVICE_LINE, -sw, COURT.SERVICE_LINE, -sw);
  line(ctx, v, -COURT.SERVICE_LINE, sw, COURT.SERVICE_LINE, sw);
  line(ctx, v, 0, -COURT.SERVICE_LINE, 0, COURT.SERVICE_LINE);
  // marcas centrais nas linhas de fundo
  line(ctx, v, -hl, -0.15, -hl + 0.35, -0.15, 2);
  line(ctx, v, -hl, 0.15, -hl + 0.35, 0.15, 2);
  line(ctx, v, hl, -0.15, hl - 0.35, -0.15, 2);
  line(ctx, v, hl, 0.15, hl - 0.35, 0.15, 2);

  // rede
  ctx.beginPath();
  ctx.moveTo(sx(v, 0), sy(v, -COURT.NET_HALF_WIDTH));
  ctx.lineTo(sx(v, 0), sy(v, COURT.NET_HALF_WIDTH));
  ctx.strokeStyle = C.net;
  ctx.lineWidth = Math.max(4, 0.13 * v.s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx(v, 0), sy(v, -COURT.NET_HALF_WIDTH));
  ctx.lineTo(sx(v, 0), sy(v, COURT.NET_HALF_WIDTH));
  ctx.strokeStyle = C.netBand;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPlayer(ctx, v, p, world) {
  const px = sx(v, p.y);
  const py = sy(v, p.x);
  const r = Math.max(6, PLAYER.RADIUS * v.s);

  // sombra
  ctx.beginPath();
  ctx.ellipse(px + 2, py + 4, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // raquete
  if (p.swing) {
    const phase = Math.min(1, p.swing.t / (PLAYER.SWING_WINDUP + PLAYER.SWING_ACTIVE));
    const netDir = p.team === 'a' ? 1 : -1; // direção do mundo para a rede
    const angle = (-0.9 + 1.8 * phase) * netDir;
    const rx = px + Math.cos(angle) * r * 1.15;
    const ry = py + Math.sin(angle) * r * 1.15;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // corpo
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = p.team === 'a' ? C.a : C.b;
  ctx.fill();
  ctx.strokeStyle = p.human ? C.human : 'rgba(15,23,42,0.85)';
  ctx.lineWidth = p.human ? 2.5 : 2;
  ctx.stroke();

  // turbo disponível
  if (p.turbo >= 30) {
    ctx.beginPath();
    ctx.arc(px, py, r + 3.5, -Math.PI / 2, -Math.PI / 2 + (p.turbo / 100) * Math.PI * 2);
    ctx.strokeStyle = 'rgba(167,139,250,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // barra de carga
  if (p.charging || p.charge > 0.01) {
    const w = Math.max(26, 1.1 * v.s);
    const bx = px - w / 2;
    const by = py - r - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, w + 2, 7);
    const full = p.charge >= 0.75;
    ctx.fillStyle = full ? '#a78bfa' : p.charge > 0.45 ? '#fbbf24' : '#4ade80';
    ctx.fillRect(bx, by, w * p.charge, 5);
  }
}

function drawBall(ctx, v, ball, fx) {
  if (ball.heldBy) {
    const p = { x: ball.x, y: ball.y };
    const px = sx(v, p.y);
    const py = sy(v, p.x) - 0.9 * v.s * 0.45;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3.5, 0.11 * v.s), 0, Math.PI * 2);
    ctx.fillStyle = C.ball;
    ctx.fill();
    return;
  }
  const px = sx(v, ball.y);
  const py = sy(v, ball.x);
  const zOff = ball.z * v.s * 0.45;
  // sombra
  ctx.beginPath();
  ctx.ellipse(px, py, Math.max(2.5, 0.08 * v.s), Math.max(2, 0.06 * v.s), 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();
  // rastro
  for (const tr of fx.trail) {
    const a = Math.max(0, tr.life / tr.max);
    ctx.beginPath();
    ctx.arc(sx(v, tr.y), sy(v, tr.x) - tr.z * v.s * 0.45, Math.max(2, 0.07 * v.s) * a, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(253,224,71,${0.35 * a})`;
    ctx.fill();
  }
  // marcas de quique
  for (const m of fx.marks) {
    const k = 1 - m.life / m.max;
    ctx.beginPath();
    ctx.arc(sx(v, m.y), sy(v, m.x), Math.max(3, 0.09 * v.s) + k * 0.25 * v.s, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // bola (deslocada pela altura)
  const r = Math.max(3.5, 0.11 * v.s) * (1 + ball.z * 0.02);
  ctx.beginPath();
  ctx.arc(px, py - zOff, r, 0, Math.PI * 2);
  ctx.fillStyle = C.ball;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function panel(ctx, x, y, w, h, align, color) {
  ctx.fillStyle = 'rgba(2,6,23,0.72)';
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  return { x, y, w, h, align, color };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawScoreboard(ctx, v, world) {
  const s = world.score;
  const names = NAMES[world.mode] || NAMES.singles;
  const W = Math.min(v.width - 40, 760);
  const x0 = (v.width - W) / 2;
  const y = 12;
  const h = 74;
  const wTeam = (W - 150) / 2;

  panel(ctx, x0, y, W, h, 'left', C.a);
  ctx.textBaseline = 'middle';

  const serveSide = s.server;
  const drawTeam = (team, x) => {
    const name = names[team === 'a' ? 0 : 1];
    const color = team === 'a' ? C.a : C.b;
    ctx.textAlign = 'left';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(name, x + 14, y + 22);
    if (serveSide === team) {
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

  // centro
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  const setNo = s.sets.length + 1;
  ctx.fillText(`MELHOR DE ${s.bestOf}  •  SET ${Math.min(setNo, s.sets.length + (s.winner ? 0 : 1))}`, x0 + W / 2, y + 24);
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
    ctx.translate(v.cx, v.cy + 120);
    ctx.scale(scale, scale);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(2,6,23,0.85)';
    ctx.strokeText(world.message, 0, 0);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(world.message, 0, 0);
    ctx.restore();
  }
  // dica de saque
  if (world.phase === 'serve' && !world.serve.inFlight) {
    const srv = world.byId[world.serve.serverId];
    if (srv && srv.human) {
      const key = world.mode === 'coop' || world.mode === 'versus' ? (srv.id === 'a1' ? 'ESPAÇO' : 'ENTER') : 'ESPAÇO';
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(229,231,235,0.85)';
      ctx.fillText(`SEGURE ${key} PARA CARREGAR E SOLTE PARA SACAR`, v.cx, v.cy + 168);
    }
  }
}

export function drawMatch(ctx, world, v, fx) {
  ctx.save();
  if (fx.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  }
  drawCourt(ctx, v);
  // bola sob os jogadores? desenha jogadores e depois a bola por cima
  for (const p of world.players) drawPlayer(ctx, v, p, world);
  drawBall(ctx, v, world.ball, fx);
  ctx.restore();

  drawScoreboard(ctx, v, world);
  drawMessage(ctx, v, world, fx);

  if (world.phase === 'matchover') drawGameOver(ctx, v, world);
}

export function drawGameOver(ctx, v, world) {
  ctx.fillStyle = 'rgba(2,6,23,0.66)';
  ctx.fillRect(0, 0, v.width, v.height);
  const names = NAMES[world.mode] || NAMES.singles;
  const team = world.score.winner;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillStyle = team === 'a' ? C.a : C.b;
  ctx.fillText(`VITÓRIA: ${names[team === 'a' ? 0 : 1]}`, v.cx, v.cy - 40);
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
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABEL = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };

export function drawMenu(ctx, v, menu) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, v.width, v.height);
  // quadra decorativa
  ctx.globalAlpha = 0.25;
  drawCourt(ctx, { ...v, cy: v.height * 0.72 });
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText('ACE TURBO', v.cx, 90);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText('Tênis com regras oficiais • Melhor de 3 sets • Co-op de duplas', v.cx, 135);

  const modes = [
    ['1', 'Co-op Duplas', 'P1 + P2 vs 2 CPUs', 'coop'],
    ['2', 'Simples', '1 jogador vs CPU', 'singles'],
    ['3', 'Versus', 'P1 vs P2 no mesmo teclado', 'versus'],
    ['4', 'Demo', 'CPU vs CPU (assistir)', 'demo'],
  ];
  const boxW = 520;
  const x0 = v.cx - boxW / 2;
  modes.forEach(([key, title, sub, id], i) => {
    const y = 205 + i * 74;
    const selected = MODE_ORDER[menu.modeIndex] === id;
    panel(ctx, x0, y - 26, boxW, 62, 'center', selected ? C.ball : C.dim);
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = selected ? C.ball : C.text;
    ctx.fillText(`${key}  ${title}`, x0 + 22, y - 2);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(sub, x0 + 62, y + 20);
    if (selected) {
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillStyle = C.ball;
      ctx.textAlign = 'right';
      ctx.fillText('▶', x0 + boxW - 18, y - 2);
    }
  });

  ctx.textAlign = 'center';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText(
    `Dificuldade:  ◀ ${DIFFICULTY_LABEL[menu.difficulty]} ▶   (tecla D)`,
    v.cx,
    205 + modes.length * 74 + 14,
  );
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText('ENTER / ESPAÇO  PARA COMEÇAR', v.cx, 205 + modes.length * 74 + 62);

  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  const yh = v.height - 96;
  ctx.fillText('P1: WASD move • ESPAÇO segura/solta (saque e golpe)', v.cx, yh);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(229,231,235,0.5)';
  ctx.fillText('P2: setas move • ENTER segura/solta', v.cx, yh + 24);
  ctx.fillText('Dica: segure por mais tempo para bater mais forte (turbo quando a barra fica roxa)', v.cx, yh + 46);
}
