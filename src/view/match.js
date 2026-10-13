import { drawContain, media } from '../media.js';
import { project } from './camera.js';
import { drawSkyAndGround, drawWeatherBadge, drawWind, drawCourt, drawNet } from './court.js';
import { drawPlayer, drawServeContact } from './players.js';
import { drawEffects, drawBall } from './effects.js';
import { drawScoreboard, drawMessage, drawServeAim } from './hud.js';
import { drawSetSummary, drawGameOver } from './statistics.js';
export function drawMatch(ctx, world, v, fx) {
  ctx.save();
  if (fx.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  }
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

  drawScoreboard(ctx, v, world);
  drawMessage(ctx, v, world, fx);
  drawSetSummary(ctx, v, world);
  drawWind(ctx, v, world);
  drawWeatherBadge(ctx, v, world);
  // Marca discreta no canto da quadra.
  drawContain(ctx, media.logoShort, v.width - 54, v.height - 54, 62, 62, 0.25);
  if (world.phase === 'matchover') drawGameOver(ctx, v, world, fx?.summaryPage ?? 0);
}

