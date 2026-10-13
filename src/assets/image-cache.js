export const imageReady = img => Boolean(img && img.complete && img.naturalWidth > 0);
// Shared loader with observable completion/failure and explicit retries.
export function createImageCache(sources, { images = {}, getImageType = () => globalThis.Image } = {}) {
  const status = Object.fromEntries(Object.keys(sources).map(key => [key, 'idle']));
  const pending = {};
  function load({ retry = false } = {}) {
    const ImageType = getImageType(); if (!ImageType) return images;
    for (const [key, src] of Object.entries(sources)) {
      if (status[key] === 'loading' || status[key] === 'ready' || (status[key] === 'error' && !retry)) continue;
      const img = new ImageType(); images[key] = img; status[key] = 'loading'; img.decoding = 'async';
      pending[key] = new Promise(resolve => {
        const finish = state => { status[key] = state; img.onload = img.onerror = null; resolve({ key, state }); };
        img.onload = () => Promise.resolve().then(() => img.decode?.()).catch(() => {}).then(() => finish(imageReady(img) ? 'ready' : 'error'));
        img.onerror = () => finish('error');
        try { img.src = src; } catch { finish('error'); }
      });
    }
    return images;
  }
  return { images, status, load, whenSettled: () => { load(); return Promise.all(Object.values(pending)); } };
}
