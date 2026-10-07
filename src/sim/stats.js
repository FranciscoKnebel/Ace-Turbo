// Stats dos jogadores (força, técnica, saque e vigor), de 50 a 99, e as 8
// classes com presets. O neutro é 75: em 75 todos os multiplicadores são 1,0,
// então uma partida sem configuração continua com o comportamento antigo.
import { clamp } from './math.js';
import { FATIGUE, STAMINA } from './constants.js';

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
  speedster: { power: 64, technique: 78, serve: 75, stamina: 99 },
  veteran: { power: 74, technique: 92, serve: 86, stamina: 56 },
  bruiser: { power: 99, technique: 60, serve: 88, stamina: 78 },
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

// Traços de comportamento da IA por classe: o quanto avança à rede (`net`),
// se joga mais atrás ou mais perto da linha (`depth`, -1 a +1), a agressividade
// na escolha de batida (`aggression`) e a preferência por efeito (`spin`,
// `slice`, `lob`). Tudo 0 a 1, com 0,5 sendo neutro.
export const CLASS_TRAITS = {
  balanced: { net: 0.35, depth: 0, aggression: 0.5, spin: 0.5, slice: 0.5, lob: 0.5 },
  power: { net: 0.3, depth: 0.2, aggression: 0.85, spin: 0.7, slice: 0.2, lob: 0.2 },
  wall: { net: 0.12, depth: -0.6, aggression: 0.25, spin: 0.4, slice: 0.65, lob: 0.6 },
  server: { net: 0.45, depth: 0.1, aggression: 0.6, spin: 0.5, slice: 0.6, lob: 0.3 },
  technician: { net: 0.4, depth: 0, aggression: 0.5, spin: 0.6, slice: 0.7, lob: 0.4 },
  speedster: { net: 0.35, depth: 0.1, aggression: 0.45, spin: 0.5, slice: 0.5, lob: 0.5 },
  veteran: { net: 0.6, depth: -0.1, aggression: 0.55, spin: 0.6, slice: 0.75, lob: 0.5 },
  bruiser: { net: 0.5, depth: 0.3, aggression: 0.95, spin: 0.8, slice: 0.1, lob: 0.1 },
};
export const DEFAULT_TRAITS = CLASS_TRAITS.balanced;

export function traitsFor(classId) {
  return CLASS_TRAITS[classId] ?? DEFAULT_TRAITS;
}

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
    return { classId: 'custom', stats: clampStats(entry.stats), traits: DEFAULT_TRAITS };
  }
  let classId = entry?.classId;
  if (classId === 'random') classId = randomClass(rng);
  if (!CLASSES[classId]) classId = 'balanced';
  return { classId, stats: { ...CLASSES[classId] }, traits: traitsFor(classId) };
}

// -1 (50), 0 (75) e +1 (99): base dos multiplicadores.
function centered(value) {
  return clamp((value - STATS.NEUTRAL) / (STATS.MAX - STATS.NEUTRAL), -1, 1);
}

export const powerMul = (stats) => 1 + 0.15 * centered(stats.power);
// Quanto maior a técnica, menor o erro (multiplicador abaixo de 1).
export const techniqueErrorMul = (stats) => 1 - 0.12 * centered(stats.technique);
// Força também ajuda a absorver bola pesada (quem tem potência devolve melhor
// o ritmo do adversário).
export const heavyResistMul = (stats) => 1 - 0.25 * centered(stats.power);
export const serveSpeedMul = (stats) => 1 + 0.13 * centered(stats.serve);
export const serveRiskMul = (stats) => 1 - 0.35 * centered(stats.serve);
export const staminaMax = (stats) => Math.round(100 * (1 + 0.25 * centered(stats.stamina)));

// Vigor efetivo do jogador: a barra encolhe com a fadiga de partida.
export const staminaMaxOf = (p) => {
  const base = p.staminaMax ?? STAMINA.MAX;
  // Fadiga de partida (por set) e queima (gastar vigor cansado) somam, com
  // piso de FATIGUE.MIN_MUL (50%) do máximo inicial.
  const loss = Math.min(1 - FATIGUE.MIN_MUL, (p.fatigue ?? 0) + (p.burn ?? 0));
  return base * (1 - loss);
};

// Fração da barra (0 a 1) e cansaço gradual (0 a 1): 0 com a barra em
// TIRED_FROM ou mais, 1 com a barra vazia.
export const staminaFraction = (p) =>
  clamp(p.stamina / Math.max(1, staminaMaxOf(p)), 0, 1);

export const tirednessOf = (p) =>
  clamp((STAMINA.TIRED_FROM - staminaFraction(p)) / STAMINA.TIRED_FROM, 0, 1);
// O vigor deixa o sprint mais barato (e a recarga mais rápida): com vigor 99 o
// sprint custa 35% menos e com vigor 50, 35% mais, então vigor alto rende mais
// sprints. Os demais gastos (corrida, carga e batida) usam o fator geral de 20%.
export const sprintDrainMul = (stats) => 1 - 0.35 * centered(stats.stamina);
export const staminaDrainMul = (stats) => 1 - 0.2 * centered(stats.stamina);
export const staminaRegenMul = (stats) => 1 + 0.25 * centered(stats.stamina);
