import { blankInput } from '../contracts.js';
import { PLAYER, TURBO, WEATHERS, WIND } from '../constants.js';
import { createAI } from '../ai/state.js';
import { sideOf } from '../court-sides.js';
import { resolvePlayerStats, staminaMax } from '../stats.js';
export function makePlayer(spec, diff, config, rng) {
  const human = spec.human;
  // Sem configuração no menu: humano começa equilibrado e a CPU sorteia a
  // classe a cada partida (como o menu mostra em "Aleatória").
  const entry = config ?? (human ? { classId: 'balanced' } : { classId: 'random' });
  const resolved = resolvePlayerStats(entry, rng);
  const player = {
    id: spec.id,
    team: spec.team,
    human,
    prefSide: spec.prefSide,
    x: 0,
    y: sideOf(spec.team) * 9,
    vx: 0,
    vy: 0,
    maxSpeed: PLAYER.MAX_SPEED,
    charge: 0,
    charging: false,
    chargeShot: 'flat',
    swing: null,
    swingCooldown: 0,
    turbo: TURBO.MAX,
    classId: resolved.classId,
    stats: resolved.stats,
    traits: resolved.traits,
    staminaMax: staminaMax(resolved.stats),
    stamina: staminaMax(resolved.stats),
    fatigue: 0,
    burn: 0,
    sprinting: false,
    exhausted: false,
    input: blankInput(),
    ai: null,
  };
  if (!human) {
    player.ai = createAI({ skill: diff.skill, speedMult: diff.speedMult, reaction: diff.reaction });
    player.maxSpeed = PLAYER.MAX_SPEED * diff.speedMult;
  }
  return player;
}

// Clima: resolve o horário e o vento da partida (o modo aleatório sorteia).
export function resolveWeather(kind, rng) {
  let id = kind;
  if (id === 'random') {
    const roll = rng();
    id = roll < 0.4 ? 'night' : roll < 0.75 ? 'day' : 'windy';
  }
  const def = WEATHERS[id] ?? WEATHERS.night;
  if (!def.wind) return { kind: id, time: def.time, wind: null };
  const strength = WIND.MIN + rng() * (WIND.MAX - WIND.MIN);
  const sign = rng() < 0.5 ? -1 : 1;
  return {
    kind: id,
    time: def.time,
    wind: {
      x: (rng() - 0.5) * WIND.CROSS * strength,
      y: sign * strength,
      strength,
    },
  };
}

// ---------------------------------------------------------------------------
// Estatísticas
// ---------------------------------------------------------------------------
