import { COURT, PHYS, SURFACES, SERVE } from './constants.js';
export function surfaceOf(ball) {
  return SURFACES[ball?.surface] ?? SURFACES.hard;
}

// Altura da rede na posição x (corda no centro, mais alta nos postes).
export function netHeightAt(x) {
  const t = Math.min(1, Math.abs(x) / COURT.NET_HALF_WIDTH);
  return COURT.NET_HEIGHT_CENTER + t * (COURT.NET_HEIGHT_POST - COURT.NET_HEIGHT_CENTER);
}

// A bola está dentro da quadra (linhas valem)?
// A linha faz parte da quadra: basta a bola TOCAR a linha. O centro pode estar
// até um raio além dela, mas a pegada é circular: nos cantos vale a distância
// radial (um centro 5 cm além da lateral E da linha de fundo está a ~7 cm da
// quadra, então não toca).
export function isInCourt(x, y, doubles) {
  const hw = doubles ? COURT.DOUBLES_HALF_WIDTH : COURT.SINGLES_HALF_WIDTH;
  const dx = Math.max(0, Math.abs(x) - hw);
  const dy = Math.max(0, Math.abs(y) - COURT.HALF_LENGTH);
  return Math.hypot(dx, dy) <= PHYS.BALL_RADIUS;
}

export function rectangleDistance(x, y, box) {
  if (!box) return Infinity;
  return Math.hypot(Math.max(0, box.xMin - x, x - box.xMax), Math.max(0, box.yMin - y, y - box.yMax));
}
export function courtOutDistance(x, y, doubles) {
  const hw = doubles ? COURT.DOUBLES_HALF_WIDTH : COURT.SINGLES_HALF_WIDTH;
  return Math.max(0, rectangleDistance(x, y, { xMin: -hw, xMax: hw, yMin: -COURT.HALF_LENGTH, yMax: COURT.HALF_LENGTH }) - PHYS.BALL_RADIUS);
}
export function boxOutDistance(x, y, box, radius = SERVE.BOX_TOLERANCE_M) {
  if (!box) return 0;
  return Math.max(0, rectangleDistance(x, y, box) - radius);
}
