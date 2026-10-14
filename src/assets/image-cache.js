export const imageReady = img => Boolean(img && img.complete && img.naturalWidth > 0);
// Shared selective loader. Failures settle once; retry cannot revive an old load.
export function createImageCache(sources, { images = {}, getImageType = () => globalThis.Image,
  now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
  const status = Object.fromEntries(Object.keys(sources).map(key => [key, 'idle']));
  const pending = {}, timings = {};
  function keysFor(options) {
    const keys = options?.keys ?? Object.keys(sources);
    if (!Array.isArray(keys) || keys.some(key => !Object.hasOwn(sources,key))) throw new RangeError('Unknown image key');
    return [...new Set(keys)];
  }
  function load(options = {}) {
    const keys = keysFor(options), ImageType = getImageType(); if (!ImageType) return images;
    for (const key of keys) {
      if (status[key] === 'loading' || status[key] === 'ready' || (status[key] === 'error' && !options.retry)) continue;
      const startedAt = now(), attempt = (timings[key]?.attempt ?? 0) + 1;
      timings[key] = { key, source:sources[key], state:'loading', startedAt, durationMs:null, attempt };
      status[key] = 'loading';
      let img;
      try { img = new ImageType(); } catch {
        status[key] = 'error'; timings[key] = {...timings[key],state:'error',durationMs:now()-startedAt};
        pending[key] = Promise.resolve({key,state:'error'}); continue;
      }
      images[key] = img; img.decoding = 'async';
      pending[key] = new Promise(resolve => {
        let finished = false;
        const finish = state => {
          if (finished) return; finished = true;
          status[key] = state; img.onload = img.onerror = null;
          timings[key] = {...timings[key],state,durationMs:now()-startedAt}; resolve({key,state});
        };
        img.onload = () => Promise.resolve().then(() => img.decode?.()).catch(() => {}).then(() => finish(imageReady(img) ? 'ready' : 'error'));
        img.onerror = () => finish('error');
        try { img.src = sources[key]; } catch { finish('error'); }
      });
    }
    return images;
  }
  return { images, status, load,
    whenSettled: (options = {}) => { load(options); return Promise.all(keysFor(options).map(key => pending[key]).filter(Boolean)); },
    diagnostics: () => structuredClone(timings),
  };
}
