import { boot } from './app/controller.js';
export { boot, serveIcon } from './app/controller.js';
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof requestAnimationFrame === 'function') boot();
