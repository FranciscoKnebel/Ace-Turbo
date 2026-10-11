import { createImageCache, imageReady } from './assets/image-cache.js';
// Ícones de ação em assets/icons/vectors (SVG, escalam bem). Cada ação tem a
// versão normal e as variantes -plus/-minus: o selo + marca o forehand (lado
// bom) e o selo - o backhand (lado ruim); o neutro usa a versão normal.
export const icons = {};

import { ICON_SOURCES } from './assets/manifest.js';
export { ICON_SOURCES } from './assets/manifest.js';
const cache = createImageCache(ICON_SOURCES, { images: icons });
export const iconStatus = cache.status;
export const loadIcons = options => cache.load(options);
export const iconsSettled = options => cache.whenSettled(options);
export const iconDiagnostics = () => cache.diagnostics();
export const iconReady = imageReady;

export function icon(name) {
  if (Object.hasOwn(ICON_SOURCES, name)) cache.load({ keys: [name] });
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
