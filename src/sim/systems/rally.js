import { enterRally } from './phases.js';
import { SHOT_PROFILES as PROFILE } from '../shot-profiles.js';
import { COURT, CURVE, NET, PHYS, TURBO, WIND } from '../constants.js';
import { sideOf } from '../court-sides.js';
import { clamp, lerp, solveBallistic } from '../math.js';
import { powerMul, heavyResistMul, techniqueErrorMul } from '../stats.js';
import { emitEvent, observeTelemetry } from '../systems/telemetry.js';
import { aimWorld, clearanceTime } from '../systems/shot-model.js';
import { aimScale } from '../ai/aim.js';
export function executeRallyShot(world, p, ball) {
  if (world.phase !== 'serve' && world.phase !== 'rally') return;
  const charge = clamp(p.swing.charge, 0, 1);
  const side = sideOf(p.side ?? p.team);
  const opp = -side;
  const aim = aimWorld(p);

  if (ball.lastHit && ball.lastHit.isServe) {
    // Devolução feita: libera o jogo normal (o parceiro já pode bater depois).
    enterRally(world, { returned: true });
  }

  // Tipo de batida escolhido pela tecla (flat, topspin, slice ou lob).
  const shot = p.swing.shot ?? 'flat';
  const isTopspin = shot === 'topspin';
  const isSlice = shot === 'slice';
  const isLob = shot === 'lob';

  // Forehand/backhand: de que lado do corpo (em relação à mão dominante) a
  // bola foi batida. Forehand é mais forte e seguro; backhand erra mais.
  const lateral = (ball.x - p.x) * ((p.side ?? p.team) === 'a' ? 1 : -1);
  const hand = lateral > 0.2 ? 'forehand' : lateral < -0.2 ? 'backhand' : 'neutral';

  // Situação do golpe (mecânicas fundamentais do tênis):
  // devolução (primeiro golpe após o saque), voleio (antes do quique, perto da
  // rede), smash (bola alta antes do quique), meio-voleio (logo após o quique,
  // bola baixa) ou bola de fundo.
  const preBounce = ball.bounces.length === 0;
  const nearNet = Math.abs(p.y) < NET.VOLLEY_BALL_Y;
  let situation = 'fundo';
  if (ball.lastHit && ball.lastHit.isServe) situation = 'devolucao';
  else if (preBounce && ball.z > 1.55) situation = 'smash';
  else if (preBounce && nearNet) situation = 'voleio';
  else if (!preBounce && ball.z < 0.15 && ball.sinceBounce < 0.07) situation = 'meio-voleio';

  const depth = (aim.fwd + 1) / 2;
  let targetY = opp * lerp(PROFILE.flat.near, PROFILE.flat.deep, depth);
  // Top spin: mais fundo (perto da linha de fundo) e com quique mais alto.
  if (isTopspin) targetY = opp * lerp(PROFILE.topspin.near, PROFILE.topspin.deep, depth);
  if (isSlice) targetY *= PROFILE.slice.depth; // slice cai um pouco mais curta
  if (isLob) targetY = opp * PROFILE.lob.deep;
  if (situation === 'voleio') targetY *= 0.9; // voleio é firme, mas fundo
  else if (situation === 'meio-voleio') targetY *= 1.05; // meio-voleio levanta a bola

  let targetX = aim.x == null ? clamp(p.x * 0.7, -3.4, 3.4) : aim.x * aimScale(world);

  let turbo = false;
  if (!isLob && !isSlice && charge >= TURBO.THRESHOLD && p.turbo >= TURBO.COST) {
    turbo = true;
    p.turbo -= TURBO.COST;
    targetY *= TURBO.DEEP_BONUS;
    observeTelemetry(world, { type: 'turbo' });
  }

  // Erro: humano depende da carga; IA depende da habilidade. Rallies longos
  // acumulam "pressão" e aumentam o erro (pontos precisam terminar).
  world.rallyShots += 1;
  const pressure = p.human ? Math.min(0.2, world.rallyShots * 0.008) : Math.min(0.3, world.rallyShots * 0.018);
  // Bola pesada: devolver bola rápida é mais difícil (a força do adversário
  // vira erro de quem devolve). O termo entra antes dos multiplicadores, então
  // a técnica também ameniza.
  const incomingSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const heavy =
    Math.min(
      PHYS.HEAVY_MAX,
      Math.max(0, incomingSpeed - PHYS.HEAVY_SPEED) * PHYS.HEAVY_ERROR,
    ) * heavyResistMul(p.stats);
  // Pressão de rede: com um adversário adiantado, quem passa precisa mirar
  // fino, senão a bola vai na raquete dele.
  const netPressure = world.players.some(
    (q) => q.team !== p.team && Math.abs(q.y) < NET.VOLLEY_Y,
  )
    ? NET.PRESSURE
    : 0;
  let errMag =
    (p.human ? charge * 0.3 : (1 - p.ai.skill) * 0.4) + pressure + heavy + netPressure;
  // O top spin arrisca mais (alvo fundo, quique alto): erro maior.
  if (isTopspin) errMag = errMag * 1.3 + 0.1;
  else if (isSlice || isLob) errMag *= 0.85;
  // Forehand é mais preciso; backhand é mais instável; bater no corpo (neutro)
  // é o pior: a bola vem em cima do jogador e o golpe sai fraco e impreciso.
  if (hand === 'forehand') errMag *= 0.85;
  else if (hand === 'backhand') errMag *= 1.3;
  else errMag *= 1.45;
  // Voleio e smash são firmes; meio-voleio é defensivo.
  if (situation === 'voleio') errMag *= 0.85;
  else if (situation === 'smash') errMag *= 0.9;
  else if (situation === 'meio-voleio') errMag *= 0.95;
  // Técnica: menos erro de execução (multiplicador abaixo de 1).
  errMag *= techniqueErrorMul(p.stats);
  if (!p.human) {
    // Erro não forçado ocasional (a bola sai ou fica curta): pontos terminam.
    const shankChance =
      0.03 + (1 - p.ai.skill) * 0.04 + Math.min(0.04, world.rallyShots * 0.004);
    if (world.rng() < shankChance) errMag += 0.75 + world.rng() * 1.1;
  }
  // 1) Alvo base dentro da quadra, com margem das linhas.
  const aimMaxX = (world.doubles ? COURT.DOUBLES_HALF_WIDTH : COURT.SINGLES_HALF_WIDTH) - 0.5;
  targetX = clamp(targetX, -aimMaxX, aimMaxX);
  const aimMaxY = COURT.HALF_LENGTH - 0.5;
  targetY = opp > 0 ? clamp(targetY, 0.5, aimMaxY) : clamp(targetY, -aimMaxY, -0.5);

  // 2) Erro de execução: pode tirar a bola (faltas/bolas fora acontecem).
  const ang = world.rng() * Math.PI * 2;
  targetX += Math.cos(ang) * Math.max(0, errMag);
  targetY += Math.sin(ang) * Math.max(0, errMag);

  // 3) Limite generoso, só para não mirar em lugares absurdos.
  const maxX = COURT.DOUBLES_HALF_WIDTH + 0.8;
  targetX = clamp(targetX, -maxX, maxX);
  targetY =
    opp > 0
      ? clamp(targetY, 0.5, COURT.HALF_LENGTH + 1.2)
      : clamp(targetY, -(COURT.HALF_LENGTH + 1.2), -0.5);

  const from = { x: ball.x, y: ball.y, z: Math.max(0.05, ball.z) };
  const to = { x: targetX, y: targetY, z: 0.04 };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  let baseSpeed = (turbo ? lerp(12, 22, charge) : lerp(9.5, 18, charge)) * powerMul(p.stats);
  if (situation === 'smash') baseSpeed *= NET.SMASH_SPEED;
  let speedMul = hand === 'forehand' ? 1.05 : hand === 'backhand' ? 0.95 : 0.86;
  if (isSlice) speedMul *= PROFILE.slice.speed; // slice é mais lenta
  const avgSpeed = baseSpeed * speedMul;
  let flight = clamp(dist / avgSpeed, 0.45, 1.2);
  if (isLob) flight *= PROFILE.lob.flight;
  if (situation === 'voleio') flight *= 0.8;
  else if (situation === 'smash') flight *= 0.72;
  else if (situation === 'meio-voleio') flight *= 1.3;
  // Risco ocasional de bola na rede (golpe fraco/erro de timing).
  const netRisk =
    (p.human ? (1 - Math.min(1, charge / 0.5)) * 0.15 : (1 - p.ai.skill) * 0.07) *
    techniqueErrorMul(p.stats);
  const margin = world.rng() < netRisk ? -0.04 : isLob ? 0.5 : isSlice ? 0.06 : 0.1;
  flight = clearanceTime(from, to, flight, margin);

  // Slice tem efeito lateral: compensa o alvo (com o voo final) para a bola
  // cair no lugar certo mesmo curvando.
  const curve = isSlice ? CURVE.SLICE_SHOT : 0;
  if (curve) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const drift = 0.5 * curve * flight * flight;
    to.x -= (-dy / len) * drift;
    to.y -= (dx / len) * drift;
  }
  // Vento: compensa o alvo pelo deslocamento previsto (0,5 * a * t^2), com um
  // resíduo para o vento ainda pedir ajuste de quem bate.
  const wind = world.weather?.wind;
  if (wind) {
    const comp = 0.5 * flight * flight * WIND.COMPENSATION;
    to.x -= wind.x * comp;
    to.y -= wind.y * comp;
  }
  const v = solveBallistic(from, to, flight, PHYS.GRAVITY, PHYS.AIR_DRAG);
  Object.assign(ball, {
    vx: v.vx,
    vy: v.vy,
    vz: v.vz,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
    heldBy: null,
    spin: shot,
    // Top spin quica mais alto; slice fica baixo.
    bounceScale: situation === 'smash' ? 1.15 : (PROFILE[shot] ?? PROFILE.flat).bounce,
    curve,
    lastHit: { team: p.team, player: p.id, isServe: false, turbo, shot, hand, situation },
  });
  emitEvent(world, { type: 'hit', player: p.id, turbo, shot, hand, situation });
}

// Tipo de batida a partir do input (função pura).
