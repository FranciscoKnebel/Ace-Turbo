import { COURT, PHYS } from '../constants.js';
import { surfaceOf, netHeightAt, isInCourt } from '../geometry.js';
export function stepBall(ball, dt, doubles, events) {
  if (ball.dead || ball.heldBy) return;
  let remaining = dt;
  while (remaining > 1e-9 && !ball.dead) {
    const h = Math.min(remaining, PHYS.MAX_SUBSTEP);
    remaining -= h;
    ball.px = ball.x;
    ball.py = ball.y;
    ball.pz = ball.z;
    substep(ball, h, doubles, events);
  }
}

function substep(ball, dt, doubles, events) {
  ball.sinceBounce += dt;
  // Vento: aceleração constante na direção do vento da partida.
  if (ball.wind) {
    ball.vx += ball.wind.x * dt;
    ball.vy += ball.wind.y * dt;
  }
  // Efeito lateral do slice (Magnus simplificado): acelera para a esquerda do
  // sentido de deslocamento, curvando a bola para fora.
  if (ball.curve) {
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 0.5) {
      const nx = -ball.vy / sp;
      const ny = ball.vx / sp;
      ball.vx += nx * ball.curve * dt;
      ball.vy += ny * ball.curve * dt;
    }
  }
  const drag = Math.exp(-PHYS.AIR_DRAG * dt);
  ball.vx *= drag;
  ball.vy *= drag;
  ball.vz *= drag;
  ball.vz -= PHYS.GRAVITY * dt;

  const px = ball.x;
  const py = ball.y;
  const pz = ball.z;
  ball.x = px + ball.vx * dt;
  ball.y = py + ball.vy * dt;
  ball.z = pz + ball.vz * dt;

  // Travessia do plano da rede (y = 0).
  const crossing = (py < 0 && ball.y >= 0) || (py > 0 && ball.y <= 0);
  if (crossing) {
    const denom = ball.y - py;
    const f = denom === 0 ? 0 : (0 - py) / denom;
    const nx = px + (ball.x - px) * f;
    const nz = pz + (ball.z - pz) * f;
    const nh = netHeightAt(nx);
    if (Math.abs(nx) <= COURT.NET_HALF_WIDTH && nz < nh) {
      ball.touchedNet = true;
      ball.x = nx;
      ball.z = Math.max(0.05, nz);
      events.push({ type: 'net', x: nx, z: nz });
      if (nh - nz < 0.12) {
        // Raspou a fita: segue fraco para o outro lado (pode virar let).
        ball.vy *= 0.18;
        ball.vx *= 0.5;
        ball.vz = Math.max(ball.vz * 0.3, 0.8);
        ball.crossed = true;
      } else {
        // Bateu no meio da rede: volta fraca para o lado de quem bateu.
        ball.y = py < 0 ? -0.06 : 0.06;
        ball.vy = -ball.vy * 0.18;
        ball.vx *= 0.5;
        ball.vz = Math.min(ball.vz * 0.15, 0.3);
      }
    } else {
      ball.crossed = true;
      events.push({ type: 'cross', x: nx, z: nz });
    }
  }

  // Quique / rolagem no chão.
  if (ball.z <= 0 && ball.vz <= 0) {
    ball.z = 0;
    if (!ball.onGround) {
      ball.onGround = true;
      ball.sinceBounce = 0;
      const inCourt = isInCourt(ball.x, ball.y, doubles);
      ball.bounces.push({ x: ball.x, y: ball.y, inCourt });
      events.push({ type: 'bounce', x: ball.x, y: ball.y, inCourt });
      if (ball.vz < -0.9) {
        const surf = surfaceOf(ball);
        ball.vz = -ball.vz * PHYS.BOUNCE_RESTITUTION * (ball.bounceScale ?? 1) * surf.bounce;
        ball.vx *= PHYS.GROUND_FRICTION * surf.keep;
        ball.vy *= PHYS.GROUND_FRICTION * surf.keep;
        ball.onGround = false;
      } else {
        ball.vz = 0;
      }
    }
    const roll = Math.exp(-4.5 * dt);
    ball.vx *= roll;
    ball.vy *= roll;
    if (Math.hypot(ball.vx, ball.vy) < PHYS.STOP_SPEED) {
      ball.vx = 0;
      ball.vy = 0;
    }
  } else if (ball.z > 0.02) {
    ball.onGround = false;
  }

  // Limite externo (cerca): encerra a jogada.
  if (Math.abs(ball.y) > PHYS.FENCE_Y || Math.abs(ball.x) > PHYS.FENCE_X || ball.z > PHYS.MAX_Z) {
    events.push({ type: 'fence', x: ball.x, y: ball.y });
    ball.dead = true;
    ball.vx = ball.vy = ball.vz = 0;
  }
}

