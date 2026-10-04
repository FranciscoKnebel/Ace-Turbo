// Stats dos jogadores (força, técnica, saque e vigor), de 50 a 99, e as 8
// classes com presets. O neutro é 75: em 75 todos os multiplicadores são 1,0,
// então uma partida sem configuração continua com o comportamento antigo.
import { clamp } from './math.js';

export const STATS = {
  MIN: 50,
  MAX: 99,
  NEUTRAL: 75,
  KEYS: ['power', 'technique', 'serve', 'stamina'],
};

export const CLASSES = {
  balanced: { power: 75, technique: 75, serve: 75, stamina: 75 },
  power: { power: 95, technique: 60, serve: 85, stamina: 70 },
  wall: { power: 60, technique: 90, serve: 65, stamina: 95 },
  server: { power: 85, technique: 68, serve: 97, stamina: 72 },
  technician: { power: 66, technique: 97, serve: 80, stamina: 64 },
  speedster: { power: 64, technique: 72, serve: 60, stamina: 99 },
  veteran: { power: 74, technique: 92, serve: 86, stamina: 56 },
  bruiser: { power: 99, technique: 50, serve: 88, stamina: 78 },
};

export const CLASS_ORDER = [
  'balanced',
  'power',
  'wall',
  'server',
  'technician',
  'speedster',
  'veteran',
  'bruiser',
];

// Chaves aceitas na configuração do menu (aleatória por partida e personalizada).
export const CONFIG_KEYS = ['random', ...CLASS_ORDER, 'custom'];

export function clampStat(value) {
  const n = Number.isFinite(value) ? value : STATS.NEUTRAL;
  return Math.round(clamp(n, STATS.MIN, STATS.MAX));
}

export function clampStats(stats) {
  const out = {};
  for (const key of STATS.KEYS) out[key] = clampStat(stats?.[key]);
  return out;
}

// Sorteia uma classe (a IA faz isso a cada partida, com o RNG da partida).
export function randomClass(rng) {
  const roll = rng();
  const index = Math.min(CLASS_ORDER.length - 1, Math.floor(roll * CLASS_ORDER.length));
  return CLASS_ORDER[index];
}

// Resolve a configuração de um jogador: preset, aleatória ou personalizada.
export function resolvePlayerStats(entry, rng) {
  if (entry && entry.classId === 'custom' && entry.stats) {
    return { classId: 'custom', stats: clampStats(entry.stats) };
  }
  let classId = entry?.classId;
  if (classId === 'random') classId = randomClass(rng);
  if (!CLASSES[classId]) classId = 'balanced';
  return { classId, stats: { ...CLASSES[classId] } };
}

// -1 (50), 0 (75) e +1 (99): base dos multiplicadores.
function centered(value) {
  return clamp((value - STATS.NEUTRAL) / (STATS.MAX - STATS.NEUTRAL), -1, 1);
}

export const powerMul = (stats) => 1 + 0.15 * centered(stats.power);
// Quanto maior a técnica, menor o erro (multiplicador abaixo de 1).
export const techniqueErrorMul = (stats) => 1 - 0.3 * centered(stats.technique);
export const serveSpeedMul = (stats) => 1 + 0.13 * centered(stats.serve);
export const serveRiskMul = (stats) => 1 - 0.35 * centered(stats.serve);
export const staminaMax = (stats) => Math.round(100 * (1 + 0.25 * centered(stats.stamina)));
export const staminaDrainMul = (stats) => 1 - 0.2 * centered(stats.stamina);
export const staminaRegenMul = (stats) => 1 + 0.2 * centered(stats.stamina);
