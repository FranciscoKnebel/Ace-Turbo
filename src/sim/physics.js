import { COURT, PHYS } from './constants.js';

// Altura da rede na posição x (corda no centro, mais alta nos postes).
export function netHeightAt(x) {
  const t = Math.min(1, Math.abs(x) / COURT.NET_HALF_WIDTH);
  return COURT.NET_HEIGHT_CENTER + t * (COURT.NET_HEIGHT_POST - COURT.NET_HEIGHT_CENTER);
}

// A bola está dentro da quadra (linhas valem)?
export function isInCourt(x, y, doubles) {
  const hw = doubles ? COURT.DOUBLES_HALF_WIDTH : COURT.SINGLES_HALF_WIDTH;
  return Math.abs(x) <= hw && Math.abs(y) <= COURT.HALF_LENGTH;
}

export function makeBall() {
  return {
    x: 0,
    y: 0,
    z: 0.85,
    vx: 0,
    vy: 0,
    vz: 0,
    px: 0,
    py: 0,
    pz: 0.85,
    heldBy: null,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
    lastHit: null,
  };
}

// Avança a bola. Emite eventos em "events":
//   { type:'bounce', x, y, inCourt }
//   { type:'net', x, z }
//   { type:'cross', x, z }
//   { type:'fence', x, y }
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
        ball.vy *= 0.35;
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
      const inCourt = isInCourt(ball.x, ball.y, doubles);
      ball.bounces.push({ x: ball.x, y: ball.y, inCourt });
      events.push({ type: 'bounce', x: ball.x, y: ball.y, inCourt });
      if (ball.vz < -0.9) {
        ball.vz = -ball.vz * PHYS.BOUNCE_RESTITUTION;
        ball.vx *= PHYS.GROUND_FRICTION;
        ball.vy *= PHYS.GROUND_FRICTION;
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

// Previsão de trajetória (mesma física, passo fixo). Devolve
// { samples: [{x,y,z,t}], bounces: [{x,y,inCourt,t}] } até maxT ou 2 quiques.
export function predictTrajectory(ball, { maxT = 5, dt = 1 / 120, step = 0.05, doubles = false } = {}) {
  let { x, y, z, vx, vy, vz } = ball;
  const samples = [];
  const bounces = [];
  let t = 0;
  let bounceCount = 0;
  let acc = 0;
  while (t < maxT && samples.length < 100) {
    const drag = Math.exp(-PHYS.AIR_DRAG * dt);
    vx *= drag;
    vy *= drag;
    vz *= drag;
    vz -= PHYS.GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;
    if (z <= 0 && vz <= 0) {
      z = 0;
      if (vz < -0.9) {
        vz = -vz * PHYS.BOUNCE_RESTITUTION;
        vx *= PHYS.GROUND_FRICTION;
        vy *= PHYS.GROUND_FRICTION;
        bounceCount++;
        bounces.push({ x, y, inCourt: isInCourt(x, y, doubles), t });
        if (bounceCount >= 2) break;
      } else {
        vz = 0;
      }
    }
    if (Math.abs(y) > PHYS.FENCE_Y || Math.abs(x) > PHYS.FENCE_X || z > PHYS.MAX_Z) break;
    acc += dt;
    if (acc >= step) {
      acc = 0;
      samples.push({ x, y, z, t });
    }
  }
  return { samples, bounces };
}
