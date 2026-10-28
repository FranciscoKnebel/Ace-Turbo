export const C = {
  line: 'rgba(255,255,255,0.92)',
  net: 'rgba(15,23,42,0.8)',
  netBand: '#e2e8f0',
  post: '#cbd5e1',
  a: '#38bdf8',
  b: '#fb7185',
  ball: '#fde047',
  text: '#e5e7eb',
  dim: 'rgba(229,231,235,0.65)',
  human: '#ffffff',
};

// Céu e chão por horário (o resto da cena fica igual).

export const SKY = {
  night: { skyTop: '#0a2b3a', skyBottom: '#0b3b2c', ground: '#0b3b2c', groundFar: '#082a20' },
  day: { skyTop: '#0284c7', skyBottom: '#7dd3fc', ground: '#15803d', groundFar: '#14532d' },
};

// Cores da quadra por superfície (o resto da cena fica igual).

export const SURFACE_COLORS = {
  hard: { court: '#1b4f97', courtAlt: '#215ba9' },
  clay: { court: '#b45309', courtAlt: '#c2620c' },
  grass: { court: '#15803d', courtAlt: '#166534' },
};

// Cor da poeira do quique por superfície, já em "r,g,b" para rgba(config).

export function dustColor(surface) {
  const map = { hard: '116,147,196', clay: '204,133,66', grass: '72,140,92' };
  return map[surface] ?? map.hard;
}

// Nome do lado. No modo versus os jogadores trocam de lado, então o nome segue
// o jogador (P1/P2), não a metade da quadra.

// Escurece/clareia uma cor hex ("#rrggbb") por um fator (0 escuro, 1 original,
// >1 clareia). Serve para membros e detalhes dos bonecos sem novos assets.

export function shade(hex, factor) {
  const n = typeof hex === 'string' ? hex.replace('#', '') : '';
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return hex;
  const ch = (i) =>
    Math.max(0, Math.min(255, Math.round(parseInt(n.slice(i, i + 2), 16) * factor)));
  return `rgb(${ch(0)},${ch(2)},${ch(4)})`;
}

// Converte hex para a forma "r,g,b" (para construir rgba por alpha).

export function rgbOf(hex, fallback = '229,231,235') {
  const n = typeof hex === 'string' ? hex.replace('#', '') : '';
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return fallback;
  return `${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)}`;
}
