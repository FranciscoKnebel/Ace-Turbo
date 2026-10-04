// Sistema de idioma (i18n) mínimo: tabelas planas em src/lang/ e um tradutor
// com parâmetros `{nome}`. O idioma padrão é o português; no navegador, um
// idioma que comece com "en" vira inglês. Nos testes (Node, sem window) o
// padrão determinístico é o português.
import { pt } from './lang/pt.js';
import { en } from './lang/en.js';

export const LANGS = { pt, en };
export const LANG_ORDER = ['pt', 'en'];

let current = 'pt';

export function detectLang() {
  const nav = typeof window !== 'undefined' ? window.navigator : undefined;
  const code = String(nav?.language ?? '').toLowerCase();
  return code.startsWith('en') ? 'en' : 'pt';
}

export function setLang(code) {
  if (LANGS[code]) current = code;
  return current;
}

export function getLang() {
  return current;
}

export function t(key, params) {
  const table = LANGS[current] ?? pt;
  let text = table[key] ?? pt[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
