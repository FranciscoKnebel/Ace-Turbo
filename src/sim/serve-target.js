
import { clamp, lerp } from './math.js';
import { sideOf, serviceSign } from './court-sides.js';
import { aimWorld } from './systems/shot-model.js';
export function normalizeServeType(type) {
  return type === 'lob' ? 'power' : ['flat', 'topspin', 'slice', 'power'].includes(type) ? type : 'flat';
}

export function serveAimTarget(world, p, type = 'flat') {
  type = normalizeServeType(type);
  const s = world.serve;
  const sideSign = serviceSign(world.score, p.side ?? p.team);
  const tSign = -sideSign;
  const recvSide = -sideOf(p.side ?? p.team);
  const aim = aimWorld(p);
  const fwd01 = (aim.fwd + 1) / 2;
  const isTopspin = type === 'topspin';
  const isSlice = type === 'slice';
  const isLob = type === 'power';

  const aimX = s.attempt === 2 ? aim.x * 0.6 : aim.x;
  let tx = tSign * 2.6 + aimX * 2.2;
  let ty = recvSide * lerp(6.0, 1.8, fwd01);
  if (isTopspin) ty = recvSide * lerp(6.2, 3.0, fwd01); // kick: mais fundo
  if (isSlice) {
    ty = recvSide * lerp(5.6, 1.8, fwd01); // slice: mais curto...
    tx += tSign * 0.8; // ...e mais aberto
  }
  if (isLob) ty = recvSide * lerp(6.4, 4.0, fwd01); // power: fundo e agressivo
  tx = clamp(tx, tSign > 0 ? 0.15 : -4.0, tSign > 0 ? 4.0 : -0.15);
  ty = clamp(ty, recvSide > 0 ? 0.3 : -6.1, recvSide > 0 ? 6.1 : -0.3);
  return { x: tx, y: ty };
}

