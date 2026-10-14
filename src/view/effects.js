import { actionIcon, drawIcon } from '../icons.js';
import { C } from './palette.js';
import { project } from './camera.js';
export function drawEffects(ctx, view, world, fx) {
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


export function drawBall(ctx, view, ball, fx) {
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
