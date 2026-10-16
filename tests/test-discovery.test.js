import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestFile } from '../scripts/lib/test-discovery.mjs';
test('audit discovers Node test filenames and excludes ordinary helpers', () => {
 for (const p of ['tests/rules.test.mjs','tests/nested/rules-test.cjs','tests/rules_test.js','tests/test-.js','tests/-test.js','tests/_test.js','src/test-rules.js','test/helpers/rules.js','test/rules.test.ts','tests/rules.test.ts','tests/rules-test.mts','src/test-rules.cts','test/helpers/rules.ts']) assert.equal(isTestFile(p),true,p);
 for (const p of ['tests/helpers/rules.js','tests/rules.spec.js','tests/fixtures/state.json']) assert.equal(isTestFile(p),false,p);
});

test('audit skips hidden files and every hidden directory segment',()=>{
 for(const p of ['.foo.test.js','.hidden/foo.test.js','tests/.archive/foo.test.ts','test/.helper.js','tests\\.hidden\\foo.test.mts']) assert.equal(isTestFile(p),false,p);
});

test('source walker excludes hidden archive evidence and includes visible tests', async () => {
 const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const { testSources } = await import('../scripts/lib/test-discovery.mjs');
 const root=mkdtempSync(join(tmpdir(),'ace-discovery-'));
 try {
  mkdirSync(join(root,'.archive'));mkdirSync(join(root,'test'));
  writeFileSync(join(root,'.archive','rules.test.js'),'HIDDEN_ARCHIVE');
  writeFileSync(join(root,'test','.rules.test.ts'),'HIDDEN_FILE');
  writeFileSync(join(root,'test','rules.test.ts'),'VISIBLE_TEST');
  const sources=testSources(root);
  assert.match(sources,/VISIBLE_TEST/);assert.doesNotMatch(sources,/HIDDEN/);
 } finally { rmSync(root,{recursive:true,force:true}); }
});
