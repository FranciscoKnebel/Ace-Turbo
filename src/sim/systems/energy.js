import { FATIGUE, PLAYER, STAMINA } from '../constants.js';
import { clamp } from '../math.js';
import { staminaDrainMul, staminaMax, staminaFraction, staminaMaxOf } from '../stats.js';
export function applySetFatigue(world) {
  for (const p of world.players) {
    // Vigor 50 perde 9% por set, 75 (neutro) perde 6% e 99 perde 3%.
    const stamina = clamp(p.stats?.stamina ?? 75, 50, 99);
    const perSet =
      stamina <= 75
        ? FATIGUE.PER_SET * (1 + 0.5 * ((75 - stamina) / 25))
        : FATIGUE.PER_SET * (1 - 0.5 * ((stamina - 75) / 24));
    p.fatigue = Math.min(1 - FATIGUE.MIN_MUL, (p.fatigue ?? 0) + perSet);
    p.stamina = Math.min(p.stamina, staminaMaxOf(p));
  }
}

// Gasto de vigor. Só o sprint (o gasto forçado) queima a barra: correr, carregar
// e bater são jogo normal. Com a barra abaixo de TIRED_FROM, parte do sprint
// vira redução permanente da barra máxima (25% com vigor 50, 10% com vigor 99),
// até o piso de 50% do máximo inicial.
export function spendStamina(p, amount, burn = false) {
  if (!(amount > 0)) return;
  if (burn && staminaFraction(p) < STAMINA.TIRED_FROM) {
    const k = clamp(((p.stats?.stamina ?? 75) - 50) / 49, 0, 1);
    const factor = STAMINA.BURN_MAX + (STAMINA.BURN_MIN - STAMINA.BURN_MAX) * k;
    const base = Math.max(1, p.staminaMax ?? STAMINA.MAX);
    // Só o vigor realmente disponível queima: agir com a barra vazia não pode
    // continuar encolhendo o máximo.
    const spent = Math.min(amount, p.stamina);
    p.burn = Math.min(1, (p.burn ?? 0) + (spent * factor) / base);
    p.stamina = Math.min(p.stamina, staminaMaxOf(p));
  }
  p.stamina = Math.max(0, p.stamina - amount);
  if (p.stamina <= 0) p.exhausted = true;
}


export function applyHitCost(p, ball) {
  const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
  const stretched = p.sprinting || dist > PLAYER.REACH * STAMINA.STRETCH_REACH;
  const cost = STAMINA.HIT_COST + (stretched ? STAMINA.HIT_COST_STRETCH : 0);
  spendStamina(p, cost * staminaDrainMul(p.stats));
}

