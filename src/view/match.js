import { drawContain, media } from '../media.js';
import { project, followView } from './camera.js';
import { drawSkyAndGround, drawWeatherBadge, drawWind, drawCourt, drawNet, drawVignette } from './court.js';
import { drawPlayer, drawServeContact } from './players.js';
import { drawEffects, drawBall } from './effects.js';
import { drawScoreboard, drawMessage, drawServeAim } from './hud.js';
import { drawSetSummary, drawGameOver } from './statistics.js';
export function drawMatch(ctx, world, view, fx) {
  ctx.save();
  if (fx.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  }
  // Câmera suave: a cena usa a view com pan/zoom seguindo a bola e o HUD
  // continua na view original, sem tremer os rótulos.
  const v = followView(view, world);
  drawSkyAndGround(ctx, v, world.weather?.time);
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

  drawVignette(ctx, view, world.weather?.time);
  drawScoreboard(ctx, view, world);
  drawMessage(ctx, view, world, fx);
  drawSetSummary(ctx, view, world);
  drawWind(ctx, view, world);
  drawWeatherBadge(ctx, view, world);
  // Marca discreta no canto da quadra.
  drawContain(ctx, media.logoShort, v.width - 54, v.height - 54, 62, 62, 0.25);
  if (world.phase === 'matchover') drawGameOver(ctx, view, world, fx?.summaryPage ?? 0);
}

