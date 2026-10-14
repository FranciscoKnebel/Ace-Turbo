import { MODES } from '../sim/config.js';
import { CLASSES } from '../sim/stats.js';
import { SURFACE_ORDER, WEATHERS, WEATHER_ORDER } from '../sim/constants.js';
import { LANG_ORDER, t, detectLang } from '../i18n.js';
export function weatherLabel(index) {
  return t(`weather.${WEATHER_ORDER[index] ?? 'night'}`);
}

// Horário do clima escolhido (a Ventania é de dia; o Aleatório cai na noite,
// que é o que a partida resolve na criação).
export function weatherTime(index) {
  const kind = WEATHER_ORDER[index ?? 0] ?? 'night';
  return WEATHERS[kind]?.time ?? 'night';
}

// Seta da direção do vento (mundo: +y é o fundo da quadra, que aparece "acima"
// na tela).

export function modeSlots(modeId) {
  return (MODES[modeId] ?? MODES.singles).players;
}

export function defaultSlotConfig(slot) {
  // Humano começa equilibrado; a CPU sorteia a classe a cada partida.
  return slot.human ? { classId: 'balanced' } : { classId: 'random' };
}

export function slotConfig(menu, slot) {
  return menu.players?.config?.[slot.id] ?? defaultSlotConfig(slot);
}

export function classLabel(classId) {
  if (classId === 'random') return t('players.random');
  if (classId === 'custom') return t('players.custom');
  return CLASSES[classId] ? t(`class.${classId}`) : t('class.balanced');
}

export function slotLabel(slots, index) {
  const slot = slots[index];
  const humans = slots.slice(0, index + 1).filter((s) => s.human).length;
  const cpus = slots.slice(0, index + 1).filter((s) => !s.human).length;
  return slot.human ? `P${humans}` : `${t('players.cpu')} ${cpus}`;
}

export function playerStats(menu, slot) {
  const cfg = slotConfig(menu, slot);
  if (cfg.classId === 'custom' && cfg.stats) return cfg.stats;
  return CLASSES[cfg.classId] ?? CLASSES.balanced;
}


export const MODE_ORDER = ['coop', 'singles', 'versus', 'demo'];
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'unfair', 'impossible'];
export function difficultyLabel(index) {
  return t(`difficulty.${DIFFICULTY_ORDER[index] ?? 'easy'}`);
}
export const BEST_OF_ORDER = [1, 3, 5];
// Formato do último set e vantagem (menu).
export const FINAL_SET_ORDER = ['normal', 'super'];
export const SCORING_ORDER = ['adv', 'noad'];

export function bestOfLabel(index) {
  const n = BEST_OF_ORDER[index] ?? 1;
  return n === 1 ? t('menu.bestOf1') : n === 3 ? t('menu.bestOf3') : t('menu.bestOf5');
}

export const modeLabel = (id) => t(`mode.${id}.label`);
export const modeSub = (id) => t(`mode.${id}.sub`);

// Itens do menu: 4 modos + dificuldade + partida + ajuda.
// Tipos de linha que ciclam valor com Q/E (dentro das Configurações).
export const SETTING_KINDS = new Set([
  'difficulty',
  'bestOf',
  'finalSet',
  'scoring',
  'language',
  'surface',
  'weather',
]);

// Categorias da tela de Configurações (cada uma com as suas linhas).
export const SETTINGS_CATEGORIES = [
  { id: 'match', rows: ['difficulty', 'bestOf', 'finalSet', 'scoring'] },
  { id: 'court', rows: ['surface', 'weather'] },
  { id: 'general', rows: ['language'] },
];

// Uma linha de configuração (usada na tela de Configurações).
export function settingRow(kind, menu) {
  switch (kind) {
    case 'difficulty':
      return { kind, label: t('menu.difficulty'), sub: difficultyLabel(menu.difficultyIndex) };
    case 'bestOf':
      return { kind, label: t('menu.match'), sub: bestOfLabel(menu.bestOfIndex ?? 0) };
    case 'finalSet':
      return {
        kind,
        label: t('menu.finalSet'),
        sub: t(`menu.finalSet_${FINAL_SET_ORDER[menu.finalSetIndex ?? 0] ?? 'normal'}`),
      };
    case 'scoring':
      return {
        kind,
        label: t('menu.scoring'),
        sub: t(`menu.scoring_${SCORING_ORDER[menu.scoringIndex ?? 0] ?? 'adv'}`),
      };
    case 'surface':
      return {
        kind,
        label: t('menu.surface'),
        sub: t(`surface.${SURFACE_ORDER[menu.surfaceIndex ?? 0] ?? 'hard'}`),
      };
    case 'weather':
      return { kind, label: t('menu.weather'), sub: weatherLabel(menu.weatherIndex ?? 0) };
    case 'language':
      return {
        kind,
        label: t('menu.language'),
        sub: t(`lang.${LANG_ORDER[menu.langIndex ?? 0] ?? 'pt'}`),
      };
    default:
      return null;
  }
}

// Menu principal: modos, Configurações, Jogadores e Como jogar.
export function menuRows(menu) {
  const rows = MODE_ORDER.map((id) => ({
    kind: 'mode',
    modeId: id,
    label: modeLabel(id),
    sub: modeSub(id),
  }));
  rows.push({
    kind: 'settings',
    label: t('menu.settings'),
    sub: t('menu.settingsSub'),
  });
  rows.push({
    kind: 'players',
    label: t('menu.players'),
    sub: t('menu.playersSub'),
  });
  rows.push({
    kind: 'help',
    label: t('menu.help'),
    sub: t('menu.helpSub'),
  });
  // O teclado só emite Digit0 a Digit9: as 9 primeiras linhas ganham atalho
  // numérico (o resto é alcançado com as setas).
  rows.forEach((row, i) => {
    if (i < 9) row.key = String(i + 1);
    else delete row.key;
  });
  return rows;
}


export function createMenu() {
  return { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0, finalSetIndex: 0,
    scoringIndex: 0, surfaceIndex: 0, weatherIndex: 0,
    langIndex: Math.max(0, LANG_ORDER.indexOf(detectLang())), focus: 0,
    players: { focus: 0, selected: 0, config: {} }, settings: { category: 0, focus: 0 } };
}
const SETTINGS = { difficulty: ['difficultyIndex', DIFFICULTY_ORDER], bestOf: ['bestOfIndex', BEST_OF_ORDER],
  finalSet: ['finalSetIndex', FINAL_SET_ORDER], scoring: ['scoringIndex', SCORING_ORDER],
  surface: ['surfaceIndex', SURFACE_ORDER], weather: ['weatherIndex', WEATHER_ORDER], language: ['langIndex', LANG_ORDER] };
export function cycleMenuSetting(menu, kind, delta) {
  const setting = SETTINGS[kind];
  if (!setting) return false;
  const [key, values] = setting;
  menu[key] = ((menu[key] ?? 0) + delta % values.length + values.length) % values.length;
  return true;
}
