import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('initial and patch releases synchronize versions and isolate changelog entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meteoswiss-release-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  const release = (type) =>
    execFileSync(process.execPath, ['scripts/release.js', type], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, GITHUB_REPOSITORY: 'ValentinHttr/gladys-meteoswiss' },
    });
  const read = async (name) => JSON.parse(await readFile(join(dir, name), 'utf8'));
  try {
    await mkdir(join(dir, 'scripts'));
    for (const file of [
      'package.json',
      'package-lock.json',
      'gladys-assistant-integration.json',
      'CHANGELOG.md',
      '.gitignore',
      'scripts/release.js',
    ]) {
      await copyFile(file, join(dir, file));
    }
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    git('add', '.');
    git('commit', '-m', 'feat: initial Swiss forecasts');
    assert.throws(() => release('patch'), /Use initial/);
    assert.equal(release('initial').trim(), '1.0.0');
    assert.match(await readFile(join(dir, 'release-notes.md'), 'utf8'), /initial Swiss forecasts/);
    git('add', '.');
    git('commit', '-m', 'chore(release): 1.0.0');
    git('tag', 'v1.0.0');
    assert.throws(() => release('initial'), /already exists/);
    assert.throws(() => release('patch'), /No changes/);
    await writeFile(join(dir, 'fix.txt'), 'fixed');
    assert.throws(() => release('patch'), /clean working tree/);
    git('add', '.');
    git('commit', '-m', 'fix: keep Swiss dates');
    assert.equal(release('patch').trim(), '1.0.1');
    const pkg = await read('package.json');
    const lock = await read('package-lock.json');
    const manifest = await read('gladys-assistant-integration.json');
    assert.equal(pkg.version, '1.0.1');
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages[''].version, pkg.version);
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.docker_image, 'ghcr.io/valentinhttr/gladys-meteoswiss:1.0.1');
    const notes = await readFile(join(dir, 'release-notes.md'), 'utf8');
    assert.match(notes, /keep Swiss dates/);
    assert.doesNotMatch(notes, /initial Swiss forecasts/);
    const changelog = await readFile(join(dir, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 1\.0\.0/);
    assert.match(changelog, /## 1\.0\.1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
