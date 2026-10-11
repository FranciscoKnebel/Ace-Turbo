import { COURT, PLAYER } from '../constants.js';
import { sideOf } from '../ai.js';
import { clamp } from '../math.js';
export function clampPlayerToCourt(p) {
  const side = sideOf(p.team);
  const xMax = COURT.DOUBLES_HALF_WIDTH + 1.8;
  p.x = clamp(p.x, -xMax, xMax);
  const yMax = COURT.HALF_LENGTH + 3.2; // dá para buscar bola atrás da linha
  if (side < 0) p.y = clamp(p.y, -yMax, -PLAYER.NET_MARGIN);
  else p.y = clamp(p.y, PLAYER.NET_MARGIN, yMax);
}

// Colisão entre companheiros de time: ninguém ocupa o mesmo espaço.
export function resolvePlayerCollisions(world) {
  const players = world.players;
  const minD = PLAYER.RADIUS * 2;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.team !== b.team) continue; // times ficam em lados opostos da rede
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= minD) continue;
      if (d < 1e-4) {
        a.x -= minD / 2;
        b.x += minD / 2;
      } else {
        const push = (minD - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
      clampPlayerToCourt(a);
      clampPlayerToCourt(b);
    }
  }
}

