// Imagens de marca em assets/media (carregadas sob demanda, sem dependências).
// Em Node (testes) não existe Image: o carregamento é ignorado e os helpers de
// desenho não fazem nada enquanto a imagem não estiver pronta.
export const media = { logo: null, logoShort: null, landing: null };

const SOURCES = {
  logo: 'assets/media/logo.png',
  logoShort: 'assets/media/logo-short.png',
  landing: 'assets/media/landing.png',
};

let started = false;

export function loadMedia() {
  if (started || typeof Image === 'undefined') return media;
  started = true;
  for (const [key, src] of Object.entries(SOURCES)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    media[key] = img;
  }
  return media;
}

export function imageReady(img) {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

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
