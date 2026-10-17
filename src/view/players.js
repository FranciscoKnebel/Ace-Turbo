import { tossZone } from '../sim/systems/shot-model.js';
import { PLAYER, SERVE, STAMINA, TURBO } from '../sim/constants.js';
import { staminaMaxOf } from '../sim/stats.js';
import { clamp } from '../sim/math.js';
import { t } from '../i18n.js';
import { drawIcon, icon } from '../icons.js';
import { C, shade } from './palette.js';
import { project } from './camera.js';
import { softEllipse } from './primitives.js';
export function racketWorldPosition(p, ball, swingPhase = null) {
  const bx = ball.x - p.x;
  const by = ball.y - p.y;
  const ballDist = Math.hypot(bx, by);
  const netDir = (p.side ?? p.team) === 'a' ? 1 : -1;
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

// Cor da barra de vigor: sprint em ciano, cansaço em âmbar (a partir de
// TIRED_FROM) e vermelho abaixo de LOW.

export function staminaBarColor(frac, sprinting) {
  if (sprinting) return '#22d3ee';
  if (frac <= STAMINA.LOW) return '#f87171';
  if (frac <= STAMINA.TIRED_FROM) return '#fbbf24';
  return '#38bdf8';
}

// ---------------------------------------------------------------------------
// Boneco articulado: pernas com passada, braços e inclinação pela corrida.
// ---------------------------------------------------------------------------
// A passada é uma fase determinística por jogador (hash do id + tempo) e a
// amplitude segue a velocidade real (vx/vy) normalizada pelo maxSpeed. A
// direção das pernas é a projeção do vetor de movimento na tela.

function strideOf(p, world) {
  const speed = Math.hypot(p.vx ?? 0, p.vy ?? 0);
  const norm = clamp(speed / Math.max(0.01, p.maxSpeed ?? PLAYER.MAX_SPEED), 0, 1);
  const hash = String(p.id ?? '')
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    norm,
    phase: ((hash % 628) / 100) + (world?.elapsed ?? 0) * (4 + norm * 6.5),
  };
}

// Membro como curva (origin, "joelho" no meio e ponta): pernas e braços.

function limb(ctx, x0, y0, x1, y1, bendX, bendY, style, width) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(bendX, bendY, x1, y1);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

export function drawPlayer(ctx, view, p, world) {
  const feet = project(view, p.x, p.y, 0);
  const head = project(view, p.x, p.y, 1.75);
  if (!feet || !head) return;
  const h = Math.max(10, feet.y - head.y);
  const w = Math.max(9, h * 0.4);
  const color = p.team === 'a' ? C.a : C.b;
  const limbStyle = String(shade(color, 0.78));

  // Estado de corrida para a passada e a inclinação.
  const stride = strideOf(p, world);
  const runNorm = stride.norm;
  let dirX = 0;
  let dirY = 0;
  if (runNorm > 0.01) {
    const speed = Math.hypot(p.vx ?? 0, p.vy ?? 0);
    const ahead = project(view, p.x + (p.vx ?? 0) * 0.25, p.y + (p.vy ?? 0) * 0.25, 0);
    if (ahead) {
      const dx = ahead.x - feet.x;
      const dy = ahead.y - feet.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        dirX = dx / len;
        dirY = dy / len;
      }
    }
  }

  // sombra suave (radial quando o contexto suporta)
  softEllipse(ctx, feet.x, feet.y + w * 0.02, w * 0.66, w * 0.28, '0,0,0', 0.42);

  // riscos de sprint atrás dos pés
  if (runNorm > 0.7) {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const off = (i - 0.5) * w * 0.6;
      const sx = feet.x - dirX * w * 1.1 - dirY * off;
      const sy = feet.y - dirY * w * 1.1 * 0.3 + dirX * off;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - dirX * w * 0.55, sy - dirY * w * 0.55);
      ctx.stroke();
    }
  }

  // pernas: passada alternada ao longo da direção de movimento
  const hipX = feet.x;
  const hipY = feet.y - h * 0.3;
  const step = Math.sin(stride.phase) * w * 0.55 * runNorm + Math.sin(stride.phase) * w * 0.06;
  const footAX = feet.x - w * 0.2 + dirX * step;
  const footAY = feet.y - Math.max(0, Math.cos(stride.phase)) * h * 0.05 * runNorm;
  const footBX = feet.x + w * 0.2 - dirX * step;
  const footBY = feet.y - Math.max(0, Math.cos(stride.phase + Math.PI)) * h * 0.05 * runNorm;
  limb(ctx, hipX - w * 0.16, hipY, footAX, footAY, (hipX - w * 0.16 + footAX) / 2 + dirX * 2, (hipY + footAY) / 2 - h * 0.05, limbStyle, w * 0.16);
  limb(ctx, hipX + w * 0.16, hipY, footBX, footBY, (hipX + w * 0.16 + footBX) / 2 + dirX * 2, (hipY + footBY) / 2 - h * 0.05, limbStyle, w * 0.16);

  // Raquete sempre visível, encarando a bola; varre durante o golpe.
  const stage = p.swing
    ? Math.min(1, p.swing.t / (PLAYER.SWING_WINDUP + PLAYER.SWING_ACTIVE))
    : null;
  const racketPos = racketWorldPosition(p, world.ball, stage);
  const racket = project(view, racketPos.x, racketPos.y, racketPos.z);
  const dirXr = racketPos.x - p.x;
  const dirYr = racketPos.y - p.y;
  const dLen = Math.hypot(dirXr, dirYr) || 1;
  const grip = project(view, p.x + (dirXr / dLen) * 0.12, p.y + (dirYr / dLen) * 0.12, 0.8);

  if (racket && grip) {
    // braço da raquete: do ombro até o cabo
    const shoulderX = head.x + (grip.x - head.x) * 0.12;
    const shoulderY = head.y + h * 0.24;
    limb(ctx, shoulderX, shoulderY, grip.x, grip.y, (shoulderX + grip.x) / 2 + dirYr * 3, (shoulderY + grip.y) / 2 + h * 0.03, limbStyle, w * 0.15);
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

  // corpo e cabeça inclinam levemente na direção da corrida
  ctx.save();
  ctx.translate(dirX * runNorm * w * 0.14, dirY * runNorm * w * 0.14);

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
  ctx.restore();

  // braço livre: balança com a passada e abre no golpe
  const sideDir = racket && grip ? Math.sign(grip.x - head.x || 1) : 1;
  const freePull = stage !== null ? w * 0.14 * Math.sin(stage * Math.PI) : 0;
  const freeSway = Math.sin(stride.phase + Math.PI) * w * 0.16 * runNorm;
  if (grip) {
    const shoulderX = head.x - sideDir * w * 0.2;
    const shoulderY = head.y + h * 0.24;
    const handX = shoulderX - sideDir * (w * 0.4 + freePull) + dirX * freeSway;
    const handY = shoulderY + h * 0.24 + Math.abs(Math.sin(stride.phase)) * h * 0.06 * runNorm;
    limb(ctx, shoulderX, shoulderY, handX, handY, (shoulderX + handX) / 2 - dirY * 2, (shoulderY + handY) / 2 + h * 0.02, limbStyle, w * 0.14);
  }

  // turbo disponível
  if (p.turbo >= 30) {
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y, w * 0.75, w * 0.3, 0, -Math.PI / 2, -Math.PI / 2 + (p.turbo / TURBO.MAX) * Math.PI * 2);
    ctx.strokeStyle = 'rgba(167,139,250,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Vigor (stamina): barra sob os pés, do mesmo tamanho para humanos e IA.
  const barW = Math.max(30, w * 1.8);
  const barH = 4;
  const sx = feet.x - barW / 2;
  const sy = feet.y + 8;
  const staminaFrac = clamp(p.stamina / staminaMaxOf(p), 0, 1);
  const tired = staminaFrac <= STAMINA.LOW;
  drawIcon(ctx, icon('stamina'), sx - 11, sy + barH / 2, 14, p.human ? 0.95 : 0.8);
  ctx.globalAlpha = p.human ? 1 : 0.85;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(sx - 1, sy - 1, barW + 2, barH + 2);
  // Azul normal, âmbar a partir de TIRED_FROM e vermelho abaixo de LOW.
  const barColor = staminaBarColor(staminaFrac, p.sprinting);
  // Cansado, a barra pulsa para chamar atenção.
  if (tired) ctx.globalAlpha *= 0.55 + 0.45 * Math.sin((world?.elapsed ?? 0) * 7);
  ctx.fillStyle = barColor;
  ctx.fillRect(sx, sy, barW * staminaFrac, barH);
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
    ctx.fillStyle = p.charge >= TURBO.THRESHOLD ? '#a78bfa' : p.charge > 0.45 ? '#fbbf24' : '#4ade80';
    ctx.fillRect(bx2, by2, bw * p.charge, 5);
    if (tossing) {
      // Área do toss (90%+, 0,6 a 0,9) e área interna de 100%, que cresce com o
      // stat de saque do jogador.
      const zx = bx2 + bw * SERVE.TOSS_IDEAL_MIN;
      const zw = bw * (SERVE.TOSS_IDEAL_MAX - SERVE.TOSS_IDEAL_MIN);
      ctx.strokeStyle = 'rgba(74,222,128,0.95)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(zx + 0.5, by2 - 1.5, zw - 1, 8);
      const { innerHalf, center } = tossZone(p.stats?.serve);
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

export function drawServeContact(ctx, view, world) {
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
