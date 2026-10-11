import { DIFFICULTY, SURFACE_ORDER, WEATHER_ORDER } from '../sim/constants.js';
export const MODE_ORDER = ['coop', 'singles', 'versus', 'demo'];
export const DIFFICULTY_ORDER = Object.keys(DIFFICULTY);
export const BEST_OF_ORDER = [1, 3, 5];
export const FINAL_SET_ORDER = ['normal', 'super'];
export const SCORING_ORDER = ['adv', 'noad'];
// Defaults are intentionally client defaults (easy/one set); API defaults differ.
export const SETTING_SCHEMA = Object.freeze({
  difficulty: { property:'difficultyIndex', values:DIFFICULTY_ORDER, default:'easy', label:'menu.difficulty', prefix:'difficulty.', category:'match' },
  bestOf: { property:'bestOfIndex', values:BEST_OF_ORDER, default:1, label:'menu.match', prefix:'menu.bestOf', category:'match' },
  finalSet: { property:'finalSetIndex', values:FINAL_SET_ORDER, default:'normal', label:'menu.finalSet', prefix:'menu.finalSet_', category:'match' },
  scoring: { property:'scoringIndex', values:SCORING_ORDER, default:'adv', label:'menu.scoring', prefix:'menu.scoring_', category:'match' },
  surface: { property:'surfaceIndex', values:SURFACE_ORDER, default:'hard', label:'menu.surface', prefix:'surface.', category:'court' },
  weather: { property:'weatherIndex', values:WEATHER_ORDER, default:'night', label:'menu.weather', prefix:'weather.', category:'court' },
  language: { property:'langIndex', values:['pt','en'], default:'pt', label:'menu.language', prefix:'lang.', category:'general' },
  audio: { property:'muted', values:[false,true], default:false, direct:true, label:'ui.audio', labels:{ false:'ui.soundOn', true:'ui.muted' }, category:'general' },
});
export const SETTING_KINDS = new Set(Object.keys(SETTING_SCHEMA));
export const SETTINGS_CATEGORIES = ['match','court','general'].map(id => ({id,rows:Object.keys(SETTING_SCHEMA).filter(key=>SETTING_SCHEMA[key].category===id)}));
export function readSetting(menu, kind) {
  const def=SETTING_SCHEMA[kind]; if(!def) return undefined;
  const value=def.direct ? menu[def.property] : def.values[menu[def.property]];
  return def.values.includes(value) ? value : def.default;
}
export function cycleMenuSetting(menu, kind, delta) {
  const def=SETTING_SCHEMA[kind]; if(!def) return false;
  const index=def.values.indexOf(readSetting(menu,kind));
  const next=((index+delta)%def.values.length+def.values.length)%def.values.length;
  menu[def.property]=def.direct ? def.values[next] : next; return true;
}
export function settingDefaults(language='pt') {
  return Object.fromEntries(Object.entries(SETTING_SCHEMA).map(([kind,def]) => {
    const value=kind==='language' && def.values.includes(language) ? language : def.default;
    return [def.property,def.direct ? value : def.values.indexOf(value)];
  }));
}
export function settingsSnapshot(menu) {
  return Object.fromEntries(Object.keys(SETTING_SCHEMA).map(kind=>[kind,readSetting(menu,kind)]));
}
export function matchOptionsFor(menu,seed) {
  const s=settingsSnapshot(menu);
  return {mode:MODE_ORDER[menu.modeIndex]??MODE_ORDER[0],seed,difficulty:s.difficulty,bestOf:s.bestOf,
    noAd:s.scoring==='noad',superTiebreak:s.finalSet==='super',surface:s.surface,weather:s.weather,players:menu.players.config};
}
