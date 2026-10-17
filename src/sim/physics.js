import { stepBall } from './physics/kernel.js';
export { stepBall } from './physics/kernel.js';
export { surfaceOf, netHeightAt, isInCourt } from './geometry.js';


// Superfície da bola (o mundo define; o padrão é a quadra dura).
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
    spin: 'serve',
    bounceScale: 1,
    curve: 0,
    surface: 'hard',
    wind: null,
    sinceBounce: 99,
  };
}

// Reinicia os campos transitórios, preservando o ambiente da partida.
export function resetBall(ball, state = {}) {
  const environment = { surface: ball.surface, wind: ball.wind };
  Object.assign(ball, makeBall(), environment, state);
  return ball;
}

// Avança a bola. Emite eventos em "events":
//   { type:'bounce', x, y, inCourt }
//   { type:'net', x, z }
//   { type:'cross', x, z }
//   { type:'fence', x, y }
// Forecast advances a private copy with the same collisions and substeps.
// Sampling never truncates the requested horizon. Two NEW bounces end the forecast.
export function predictTrajectory(ball, { maxT = 5, dt = 1 / 120, step = 0.05, doubles = false } = {}) {
  if (![maxT, dt, step].every(Number.isFinite) || maxT < 0 || maxT > 30 || dt <= 0 || step <= 0 || dt < 1 / 10000 || step < 1 / 10000) throw new RangeError('Invalid forecast interval');
  const copy = { ...makeBall(), ...ball, heldBy: null, bounces: (ball.bounces ?? []).map(b => ({ ...b })), wind: ball.wind ? { ...ball.wind } : null };
  const samples = [], bounces = [], events = [];
  let time = 0, nextSample = step;
  while (time < maxT - 1e-9 && !copy.dead && bounces.length < 2) {
    const h = Math.min(dt, 1 / 120, maxT - time);
    events.length = 0; stepBall(copy, h, doubles, events); time += h;
    for (const ev of events) if (ev.type === 'bounce') bounces.push({ x: ev.x, y: ev.y, inCourt: ev.inCourt, t: time });
    if (time + 1e-9 >= nextSample || time + 1e-9 >= maxT) {
      samples.push({ x: copy.x, y: copy.y, z: copy.z, t: time });
      while (nextSample <= time + 1e-9) nextSample += step;
    }
  }
  return { samples, bounces };
}
