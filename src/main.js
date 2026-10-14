import { boot } from './app/browser.js';
export { boot, serveIcon } from './app/browser.js';
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof requestAnimationFrame === 'function') boot();
