import { COURT } from '../sim/constants.js';
import { clamp } from '../sim/math.js';
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};


export function computeView(width, height) {
  const pos = { x: 0, y: -(COURT.HALF_LENGTH + 8.0), z: 5.2 };
  const target = { x: 0, y: 1.5, z: 0.8 };
  const f = norm(sub(target, pos));
  const r = norm(cross(f, { x: 0, y: 0, z: 1 }));
  const u = cross(r, f);
  return {
    width,
    height,
    cx: width / 2,
    cy: height * 0.5,
    focal: Math.min(width * 0.85, height * 0.95),
    pos,
    f,
    r,
    u,
  };
}


export function project(view, x, y, z = 0) {
  const dx = x - view.pos.x;
  const dy = y - view.pos.y;
  const dz = z - view.pos.z;
  const depth = dx * view.f.x + dy * view.f.y + dz * view.f.z;
  if (depth < 0.3) return null;
  const xc = dx * view.r.x + dy * view.r.y + dz * view.r.z;
  const yc = dx * view.u.x + dy * view.u.y + dz * view.u.z;
  return {
    x: view.cx + (xc / depth) * view.focal,
    y: view.cy - (yc / depth) * view.focal,
    depth,
    scale: view.focal / depth,
  };
}

// ---------------------------------------------------------------------------
// Câmera dinâmica: pan e zoom leves seguindo a bola.
// ---------------------------------------------------------------------------
// A câmera pinhole continua em posição fixa; aqui só deslocamos o centro de
// projeção (cx/cy) e escalamos a distância focal. É uma recorte e ampliação da
// imagem da cena, sem tocar na simulação nem no enquadramento do HUD (que
// continua desenhado com a view original). O pan é amortecido por interpolação
// exponencial e o estado fica em um WeakMap por world (view-only, sem sim).

const FOLLOW_MAX_PAN_X = 0.055; // fração da largura da tela
const FOLLOW_MAX_PAN_Y = 0.03; // fração da altura da tela
const FOLLOW_GAIN = 0.5; // quanto do desvio da bola vira pan
const FOLLOW_ZOOM = 0.028; // zoom extra quando a bola foge do centro
const FOLLOW_SPEED = 3.5; // 1/s: velocidade do amortecimento

// Store pan as viewport fractions so rotation/resizing preserves its bounds.
const followState = new WeakMap();

export function followView(view, world) {
  if (!world?.ball || !view) return view;
  const ball = world.ball;
  const pb = project(view, ball.x, ball.y, Math.max(ball.z ?? 0, 0.02));
  const elapsed = world.elapsed ?? 0;
  let state = followState.get(world);
  if (!state) {
    state = { panX: 0, panY: 0, zoom: 1, last: elapsed };
    followState.set(world, state);
  }
  let dt = elapsed - state.last;
  if (!Number.isFinite(dt) || dt < 0 || dt > 0.12) dt = 1 / 60;
  state.last = elapsed;
  // Alvo: bola centrada quando em jogo; neutro no fim da partida.
  let tx = 0;
  let ty = 0;
  let tz = 1;
  if (pb && world.phase !== 'matchover') {
    const nx = clamp((pb.x - view.cx) / (view.width / 2), -1.2, 1.2);
    const ny = clamp((pb.y - view.cy) / (view.height / 2), -1.2, 1.2);
    // Mover cx/cy "contra" a bola traz o ponto de interesse para o centro.
    tx = -nx * FOLLOW_MAX_PAN_X * FOLLOW_GAIN;
    ty = -ny * FOLLOW_MAX_PAN_Y * FOLLOW_GAIN;
    tz = 1 + FOLLOW_ZOOM * Math.min(1, Math.hypot(nx, ny * 1.2));
  }
  const k = 1 - Math.exp(-dt * FOLLOW_SPEED);
  state.panX += (tx - state.panX) * k;
  state.panY += (ty - state.panY) * k;
  state.zoom += (tz - state.zoom) * k;
  return {
    ...view,
    cx: view.cx + state.panX * view.width,
    cy: view.cy + state.panY * view.height,
    focal: view.focal * state.zoom,
  };
}

// ---------------------------------------------------------------------------
// Cena: céu, chão, quadra e rede
// ---------------------------------------------------------------------------
