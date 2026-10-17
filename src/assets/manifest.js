export const MEDIA_SOURCES = Object.freeze({ logo: 'assets/media/logo.png', logoShort: 'assets/media/logo-short.png', landing: 'assets/media/landing.png' });
export const BOOT_MEDIA = Object.freeze(['logo', 'landing']);
const BASE = 'assets/icons/vectors';

// Ações com variantes (+ / -).
const ACTIONS = [
  'shot-flat',
  'shot-topspin',
  'shot-slice',
  'shot-lob',
  'serve-flat',
  'serve-kick',
  'serve-slice',
  'serve-lob',
  'turbo',
];

// Ícones sem variantes.
const SIMPLE = ['stamina', 'net', 'tiebreak', 'weather-sun'];
// Ícones de clima que só existem em PNG.
const PNG_SIMPLE = ['weather-moon', 'weather-wind'];

export const ICON_SOURCES = {};
for (const action of ACTIONS) {
  ICON_SOURCES[action] = `${BASE}/${action}.svg`;
  ICON_SOURCES[`${action}-plus`] = `${BASE}/${action}-plus.svg`;
  ICON_SOURCES[`${action}-minus`] = `${BASE}/${action}-minus.svg`;
}
for (const name of SIMPLE) ICON_SOURCES[name] = `${BASE}/${name}.svg`;
for (const name of PNG_SIMPLE) ICON_SOURCES[name] = `assets/icons/images/${name}.png`;

