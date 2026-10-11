import { MODE_ORDER, DIFFICULTY_ORDER, BEST_OF_ORDER, FINAL_SET_ORDER, SCORING_ORDER, SETTING_SCHEMA, SETTING_KINDS, SETTINGS_CATEGORIES, readSetting, settingDefaults } from './settings.js';
export { MODE_ORDER, DIFFICULTY_ORDER, BEST_OF_ORDER, FINAL_SET_ORDER, SCORING_ORDER, SETTING_KINDS, SETTINGS_CATEGORIES, cycleMenuSetting } from './settings.js';
import { MODES } from '../sim/config.js';
import { CLASSES } from '../sim/stats.js';
import { SURFACE_ORDER, WEATHERS, WEATHER_ORDER } from '../sim/constants.js';
import { t, detectLang } from '../i18n.js';
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


export function difficultyLabel(index) { return t(`difficulty.${DIFFICULTY_ORDER[index] ?? 'easy'}`); }
export function bestOfLabel(index) {
  const n = BEST_OF_ORDER[index] ?? 1;
  return n === 1 ? t('menu.bestOf1') : n === 3 ? t('menu.bestOf3') : t('menu.bestOf5');
}

export const modeLabel = (id) => t(`mode.${id}.label`);
export const modeSub = (id) => t(`mode.${id}.sub`);

// Presentation consumes the same descriptor used by defaults/cycling/options.
export function settingRow(kind, menu) {
  const def=SETTING_SCHEMA[kind]; if(!def) return null;
  const value=readSetting(menu,kind);
  return {kind,label:t(def.label),sub:t(def.labels?.[value] ?? def.prefix+value)};
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


export function createMenu({ language = detectLang() } = {}) {
  return { modeIndex:0, ...settingDefaults(language), focus:0,
    players:{focus:0,selected:0,config:{}},settings:{category:0,focus:0} };
}
