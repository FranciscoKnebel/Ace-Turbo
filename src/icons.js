import { createImageCache, imageReady } from './assets/image-cache.js';
// Ícones de ação em assets/icons/vectors (SVG, escalam bem). Cada ação tem a
// versão normal e as variantes -plus/-minus: o selo + marca o forehand (lado
// bom) e o selo - o backhand (lado ruim); o neutro usa a versão normal.
export const icons = {};

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

const cache = createImageCache(ICON_SOURCES, { images: icons });
export const iconStatus = cache.status;
export const loadIcons = options => cache.load(options);
export const iconsSettled = () => cache.whenSettled();
export const iconReady = imageReady;

export function icon(name) {
  return icons[name] ?? null;
}

// Variante pelo lado da mão: forehand = +, backhand = -, neutro = normal.
export function handVariant(hand) {
  if (hand === 'forehand') return 'plus';
  if (hand === 'backhand') return 'minus';
  return null;
}

export function actionIconName(action, hand) {
  const variant = handVariant(hand);
  return variant ? `${action}-${variant}` : action;
}

export function actionIcon(action, hand) {
  return icon(actionIconName(action, hand));
}

// Desenha o ícone inteiro, centralizado em (cx, cy), dentro de um quadrado.
export function drawIcon(ctx, img, cx, cy, size, alpha = 1) {
  if (!iconReady(img)) return false;
  const scale = size / Math.max(img.naturalWidth, img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();
  return true;
}
