import { COURT } from '../sim/constants.js';
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
// Cena: céu, chão, quadra e rede
// ---------------------------------------------------------------------------
