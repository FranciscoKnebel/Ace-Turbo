import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestFile } from '../scripts/lib/test-discovery.mjs';
test('audit discovers Node test filenames and excludes ordinary helpers', () => {
 for (const p of ['tests/rules.test.mjs','tests/nested/rules-test.cjs','tests/rules_test.js','src/test-rules.js','test/helpers/rules.js','test/rules.test.ts','tests/rules.test.ts','tests/rules-test.mts','src/test-rules.cts','test/helpers/rules.ts']) assert.equal(isTestFile(p),true,p);
 for (const p of ['tests/helpers/rules.js','tests/rules.spec.js','tests/fixtures/state.json']) assert.equal(isTestFile(p),false,p);
});
