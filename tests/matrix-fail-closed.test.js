import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { collectRuntime } from '../scripts/balance-matrix.mjs';

test('árvore exportada sem .git segue com identidade unknown', () => {
  const root = mkdtempSync(join(tmpdir(), 'matrix-export-'));
  try {
    const { runtime, changedSource } = collectRuntime(pathToFileURL(root + '/'));
    assert.equal(runtime.revision, 'unknown'); assert.equal(runtime.tree, 'unknown');
    assert.equal(runtime.dirty, null); assert.equal(changedSource, '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('árvore exportada abaixo de um repositório bare segue com identidade unknown', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'matrix-bare-'));
  try {
    execFileSync('git', ['init', '--quiet', '--bare', '.git'], { cwd: tmp });
    mkdirSync(join(tmp, 'proj'));
    const { runtime, changedSource } = collectRuntime(pathToFileURL(join(tmp, 'proj') + '/'));
    assert.equal(runtime.revision, 'unknown'); assert.equal(runtime.tree, 'unknown');
    assert.equal(runtime.dirty, null); assert.equal(changedSource, '');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('checkout onde o Git falha derruba o runner em vez de seguir unknown', () => {
  const root = mkdtempSync(join(tmpdir(), 'matrix-broken-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/missing\n');
    assert.throws(() => collectRuntime(pathToFileURL(root + '/')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('clone real registra revisão/árvore e detecta fonte suja', () => {
  const root = mkdtempSync(join(tmpdir(), 'matrix-repo-'));
  try {
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src', 'a.txt'), 'one\n');
    git(['init', '--quiet']); git(['add', 'src/a.txt']);
    git(['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'x']);
    const clean = collectRuntime(pathToFileURL(root + '/'));
    assert.equal(clean.runtime.revision, git(['rev-parse', 'HEAD']).trim());
    assert.equal(clean.runtime.tree, git(['rev-parse', 'HEAD^{tree}']).trim());
    assert.equal(clean.runtime.dirty, false); assert.equal(clean.changedSource, '');
    writeFileSync(join(root, 'src', 'a.txt'), 'two\n');
    const dirty = collectRuntime(pathToFileURL(root + '/'));
    assert.equal(dirty.runtime.dirty, true); assert.match(dirty.changedSource, /a\.txt/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('projeto aninhado num repositório pai roda as checagens do pai (monorepo)', () => {
  const parent = mkdtempSync(join(tmpdir(), 'matrix-monorepo-'));
  try {
    const git = args => execFileSync('git', args, { cwd: parent, encoding: 'utf8' });
    mkdirSync(join(parent, 'proj', 'src'), { recursive: true }); writeFileSync(join(parent, 'proj', 'src', 'a.txt'), 'one\n');
    git(['init', '--quiet']); git(['add', 'proj/src/a.txt']);
    git(['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'x']);
    const root = pathToFileURL(join(parent, 'proj') + '/');
    const clean = collectRuntime(root);
    assert.equal(clean.runtime.revision, git(['rev-parse', 'HEAD']).trim());
    assert.equal(clean.runtime.tree, git(['rev-parse', 'HEAD^{tree}']).trim());
    assert.equal(clean.runtime.dirty, false); assert.equal(clean.changedSource, '');
    writeFileSync(join(parent, 'proj', 'src', 'a.txt'), 'two\n');
    const dirty = collectRuntime(root);
    assert.equal(dirty.runtime.dirty, true); assert.match(dirty.changedSource, /proj\/src\/a\.txt/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
