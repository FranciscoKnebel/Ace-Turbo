import * as playwright from 'playwright';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const engine = process.env.BROWSER ?? 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new RangeError(`Unsupported BROWSER: ${engine}`);
export const browserType = playwright[engine];
export const runtime = { node: process.version, platform: process.platform, playwright: require('playwright/package.json').version };
