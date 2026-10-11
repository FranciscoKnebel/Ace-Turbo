import { createImageCache, imageReady } from './assets/image-cache.js';
export { imageReady } from './assets/image-cache.js';
// Imagens de marca em assets/media (carregadas sob demanda, sem dependências).
// Em Node (testes) não existe Image: o carregamento é ignorado e os helpers de
// desenho não fazem nada enquanto a imagem não estiver pronta.
import { MEDIA_SOURCES } from './assets/manifest.js';
export { MEDIA_SOURCES } from './assets/manifest.js';
const images = { logo: null, logoShort: null, landing: null };
const cache = createImageCache(MEDIA_SOURCES, { images });
export const media = new Proxy(images, { get(target,key) {
  if (Object.hasOwn(MEDIA_SOURCES,key) && !target[key]) cache.load({keys:[key]});
  return Reflect.get(target,key);
} });
export const mediaStatus = cache.status;
export const loadMedia = options => cache.load(options);
export const mediaSettled = options => cache.whenSettled(options);
export const mediaDiagnostics = () => cache.diagnostics();

// Desenha cobrindo toda a área (recorta o excesso), como plano de fundo.
export function drawCover(ctx, img, w, h, alpha = 1) {
  if (!imageReady(img)) return false;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();
  return true;
}

// Desenha a imagem inteira dentro da caixa (contain), centralizada em (cx, cy).
export function drawContain(ctx, img, cx, cy, maxW, maxH, alpha = 1) {
  if (!imageReady(img)) return false;
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();
  return true;
}
