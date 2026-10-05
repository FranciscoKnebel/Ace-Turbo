export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Ponto dentro de uma caixa (ex.: caixa de serviço), com tolerância da linha.
export function pointInBox(x, y, box, tol = 0.03) {
  if (!box) return false;
  return x >= box.xMin - tol && x <= box.xMax + tol && y >= box.yMin - tol && y <= box.yMax + tol;
}

// Distância de um ponto P a um segmento AB (usada para a raquete "varrer" a bola).
export function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Solução balística: velocidade inicial para sair de "from" e chegar em "to"
// no tempo "time" (z para cima), com arrasto linear opcional (k = drag).
export function solveBallistic(from, to, time, gravity, drag = 0) {
  const t = Math.max(0.05, time);
  let decay;
  let vz;
  if (drag > 0) {
    const k = drag;
    decay = (1 - Math.exp(-k * t)) / k;
    vz = (to.z - from.z + (gravity * t) / k) / decay - gravity / k;
  } else {
    decay = t;
    vz = (to.z - from.z + 0.5 * gravity * t * t) / t;
  }
  return {
    vx: (to.x - from.x) / decay,
    vy: (to.y - from.y) / decay,
    vz,
  };
}

// Tempo de voo mínimo para a bola passar a rede com "clearance" metros de folga.
// Usa a parábola exata (sem arrasto, com folga extra por conta do arrasto).
export function timeForNetClearance(from, to, clearance, gravity, minTime) {
  if (from.y * to.y > 0) return minTime; // não cruza a rede
  const denom = to.y - from.y;
  if (Math.abs(denom) < 1e-6) return minTime;
  const f = (0 - from.y) / denom;
  if (!(f > 0 && f < 1)) return minTime;
  const base = from.z + f * (to.z - from.z);
  if (base >= clearance) return minTime;
  const t2 = (2 * (clearance - base)) / (gravity * f * (1 - f));
  return Math.max(minTime, Math.sqrt(t2));
}
