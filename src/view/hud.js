import { presentMessage } from '../app/messages.js';
import { serveAimTarget } from '../sim/serve-target.js';
import { t } from '../i18n.js';
import { drawIcon, icon } from '../icons.js';
import { C } from './palette.js';
import { project } from './camera.js';
import { panel } from './primitives.js';
export function teamName(world, team) {
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

export function drawScoreboard(ctx, v, world) {
  const s = world.score;
  const W = Math.min(v.width - 40, 760);
  const x0 = (v.width - W) / 2;
  const y = 12;
  const h = 74;
  const narrow = W < 500;
  const centerW = narrow ? 110 : 150;
  const wTeam = (W - centerW) / 2;
  panel(ctx, x0, y, W, h);
  ctx.textBaseline = 'middle';

  const drawTeam = (team, x) => {
    const name = teamName(world, team);
    const color = team === 'a' ? C.a : C.b;
    ctx.textAlign = 'left';
    ctx.font = narrow ? 'bold 13px system-ui, sans-serif' : 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(name, x + 14, y + 22, wTeam - 22);
    if (s.server === team) {
      ctx.beginPath();
      ctx.arc(x + 10, y + 22, 4, 0, Math.PI * 2);
      ctx.fillStyle = C.ball;
      ctx.fill();
    }
    ctx.font = narrow ? 'bold 20px system-ui, sans-serif' : 'bold 26px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(s.pointsLabel(team), x + 14, y + 52);
    const setsX = x + Math.max(40, wTeam * 0.38);
    const gamesX = x + Math.max(76, wTeam * 0.7);
    ctx.font = narrow ? '10px system-ui, sans-serif' : '13px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(t('hud.sets'), setsX, y + 45, gamesX - setsX - 4);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(s.setsWon[team]), setsX + 4, y + 63);
    ctx.font = narrow ? '10px system-ui, sans-serif' : '13px system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(t('hud.games'), gamesX, y + 45, wTeam - (gamesX - x) - 4);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(s.games[team]), gamesX + 4, y + 63);
  };
  drawTeam('a', x0);
  drawTeam('b', x0 + W - wTeam);

  ctx.textAlign = 'center';
  ctx.font = narrow ? 'bold 11px system-ui, sans-serif' : 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  const setNo = s.sets.length + 1;
  const setLabel = t('hud.set', { n: Math.min(setNo, s.sets.length + (s.winner ? 0 : 1)) });
  ctx.fillText(`${t('hud.bestOf', { n: s.bestOf })}  •  ${setLabel}`, x0 + W / 2, y + 24, centerW - 8);
  if (s.tiebreak) {
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#fbbf24';
    const tbText = t(s.tbSuper ? 'hud.superTiebreak' : 'hud.tiebreak', {
      a: s.tbPoints.a,
      b: s.tbPoints.b,
    });
    const tbW = ctx.measureText(tbText).width;
    if (!narrow) drawIcon(ctx, icon('tiebreak'), x0 + W / 2 - tbW / 2 - 17, y + 52, 24, 1);
    ctx.fillText(tbText, x0 + W / 2, y + 52, centerW - 8);
  } else {
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(`${s.games.a} - ${s.games.b}`, x0 + W / 2, y + 52);
  }
}


export function drawMessage(ctx, v, world, fx) {
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
    ctx.strokeText(presentMessage(world.message), 0, 0, v.width - 32);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(presentMessage(world.message), 0, 0, v.width - 32);
    ctx.restore();
  }
  if (world.phase === 'serve' && !world.serve.inFlight && world.serve.toss) {
    // Estágio 2: o humano segura de novo e solta no alto.
    const srv = world.byId[world.serve.toss.playerId];
    if (srv && srv.human) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(229,231,235,0.85)';
      ctx.fillText(t('hud.serveHitHint'), v.cx, v.height * 0.86, v.width - 32);
    }
  }
  if (world.phase === 'serve' && !world.serve.inFlight && !world.serve.toss) {
    const srv = world.byId[world.serve.serverId];
    if (srv && srv.human) {
      const keys = t(srv.id === 'a1' ? 'hud.serveKeys.p1' : 'hud.serveKeys.p2');
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(229,231,235,0.85)';
      ctx.fillText(t('hud.serveHint', { keys }), v.cx, v.height * 0.86, v.width - 32);
    }
  }
}

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------
// Mira do saque: mostra onde a bola vai cair (para o sacador humano).

export function drawServeAim(ctx, view, world) {
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

