import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageCache } from '../src/assets/image-cache.js';
test('global retry leaves idle assets untouched; explicit retry may load them', async () => {
  const requested = [];
  class Image { set src(value) { requested.push(value); queueMicrotask(() => this.onerror()); } }
  const cache = createImageCache({ failed: 'failed.png', idle: 'idle.png' }, { getImageType: () => Image });
  await cache.whenSettled({ keys: ['failed'] });
  await cache.whenSettled({ retry: true });
  assert.deepEqual(requested, ['failed.png', 'failed.png']);
  assert.equal(cache.status.idle, 'idle');
  await cache.whenSettled({ retry: true, keys: ['idle'] });
  assert.equal(requested.at(-1), 'idle.png');
});
