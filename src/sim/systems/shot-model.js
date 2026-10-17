import { PHYS, SERVE } from '../constants.js';
import { clamp, timeForNetClearance } from '../math.js';
import { netHeightAt } from '../physics.js';
import { STATS } from '../stats.js';
export function aimWorld(p) {
  // A IA define a mira explicitamente (input.aim) para poder mirar sem andar.
  if (p.input.aim) {
    return { x: p.input.aim.x ?? 0, fwd: p.input.aim.depth ?? 0 };
  }
  const x = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
  const upDown = (p.input.up ? 1 : 0) - (p.input.down ? 1 : 0);
  // "fwd" = em direção à rede no referencial do jogador (time A sobe, time B desce).
  const fwd = p.team === 'a' ? upDown : -upDown;
  return { x, fwd };
}


export function classifyShot(input) {
  const shot = input?.shot ?? 'flat';
  return ['flat', 'topspin', 'slice', 'lob'].includes(shot) ? shot : 'flat';
}

// Tempo de voo ajustado para passar a rede com folga (usa a altura no ponto de
// travessia aproximado).
export function clearanceTime(from, to, flight, margin) {
  const denom = to.y - from.y;
  if (Math.abs(denom) < 1e-6) return flight;
  const f = (0 - from.y) / denom;
  const crossX = from.x + (to.x - from.x) * f;
  const clearance = netHeightAt(crossX) + margin;
  return timeForNetClearance(from, to, clearance, PHYS.GRAVITY, flight);
}

// Alvo do saque (sem erro): usado pelo próprio saque e pela mira na tela.
// Mais controle de direção: a mira lateral cobre a caixa inteira e a
// profundidade vai de curta (perto da rede) a funda (perto da linha de saque).

export function tossQuality(charge, serveStat = STATS.NEUTRAL) {
  const {
    TOSS_IDEAL_MIN: lo,
    TOSS_IDEAL_MAX: hi,
    TOSS_PERFECT_MIN,
    TOSS_PERFECT_MAX,
  } = SERVE;
  const center = (lo + hi) / 2;
  const halfZone = (hi - lo) / 2;
  const k = clamp((serveStat - STATS.MIN) / (STATS.MAX - STATS.MIN), 0, 1);
  const innerHalf = TOSS_PERFECT_MIN + (TOSS_PERFECT_MAX - TOSS_PERFECT_MIN) * k;
  const d = Math.abs(charge - center);
  if (d <= innerHalf) return 1; // área interna: 100%
  if (d <= halfZone) {
    // Dentro da área: 90% na borda e ~99% na borda interna.
    const t = (d - innerHalf) / Math.max(1e-6, halfZone - innerHalf);
    return 0.99 - 0.09 * t;
  }
  return clamp(0.89 - (d - halfZone) * 1.2, 0, 0.89);
}

// Estágio 1: lança a bola. A carga define a altura do toss e a qualidade
// (zona ideal); um toss ruim sai desviado e derruba a precisão da batida.
