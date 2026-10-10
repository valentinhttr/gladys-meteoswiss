import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, mkdir, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'meteoswiss-release-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  const release = (type, env = {}) =>
    execFileSync(process.execPath, ['scripts/release.js', type], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        GH_TOKEN: '',
        GITHUB_TOKEN: '',
        GITHUB_REPOSITORY: 'ValentinHttr/gladys-meteoswiss',
        ...env,
      },
    }).trim();
  const read = async (name) => JSON.parse(await readFile(join(dir, name), 'utf8'));
  const notes = () => readFile(join(dir, 'release-notes.md'), 'utf8');
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
  for (const name of ['package.json', 'package-lock.json', 'gladys-assistant-integration.json']) {
    const value = await read(name);
    value.version = '1.0.0';
    if (value.packages) value.packages[''].version = '1.0.0';
    if (value.docker_image) value.docker_image = 'ghcr.io/valentinhttr/gladys-meteoswiss:1.0.0';
    await writeFile(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
  }
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test Author');
  git('config', 'user.email', 'test@example.invalid');
  git('add', '.');
  git('commit', '-m', 'feat: initial Swiss forecasts');
  return { dir, git, release, read, notes };
}

test('initial and patch releases synchronize versions and isolate English changelog entries', async (t) => {
  const { dir, git, release, read, notes } = await fixture(t);
  assert.throws(() => release('patch'), /Use initial/);
  assert.equal(release('initial'), '1.0.0');
  assert.match(await notes(), /### Features/);
  assert.match(await notes(), /initial Swiss forecasts/);
  assert.match(await notes(), /\/commits\/v1\.0\.0/);
  git('add', '.');
  git('commit', '-m', 'chore(release): 1.0.0');
  git('tag', 'v1.0.0');
  assert.throws(() => release('initial'), /already exists/);
  assert.throws(() => release('patch'), /No changes/);
  await writeFile(join(dir, 'fix.txt'), 'fixed');
  assert.throws(() => release('patch'), /clean working tree/);
  git('add', '.');
  git('commit', '-m', 'fix: keep Swiss dates');
  const hash = git('rev-parse', 'HEAD');
  assert.equal(release('patch'), '1.0.1');
  const pkg = await read('package.json');
  const lock = await read('package-lock.json');
  const manifest = await read('gladys-assistant-integration.json');
  assert.equal(pkg.version, '1.0.1');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, 'ghcr.io/valentinhttr/gladys-meteoswiss:1.0.1');
  const body = await notes();
  assert.ok(
    body.includes(
      `- fix: keep Swiss dates ([${hash.slice(0, 7)}](https://github.com/ValentinHttr/gladys-meteoswiss/commit/${hash})) by Test Author`,
    ),
  );
  assert.match(body, /### Bug Fixes/);
  assert.match(body, /compare\/v1\.0\.0\.\.\.v1\.0\.1/);
  assert.doesNotMatch(
    body,
    /initial Swiss forecasts|chore\(release\)|Fonctionnalités|Corrections|example.invalid/,
  );
  const changelog = await readFile(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.ok(changelog.startsWith(`# Changelog\n\n${body}`));
  assert.match(changelog, /## 1\.0\.0/);
});

test('semantic commit types group multiple authors and prevent a patch release for a feature', async (t) => {
  const { git, release, read, notes } = await fixture(t);
  git('tag', 'v1.0.0');
  git(
    'commit',
    '--allow-empty',
    '-m',
    'feat(scenes): add rain triggers',
    '--author',
    'Contributor <12345+weather-dev@users.noreply.github.com>',
  );
  git('commit', '--allow-empty', '-m', 'fix(cache): preserve zero');
  git('commit', '--allow-empty', '-m', 'perf: reduce parsing allocations');
  git('commit', '--allow-empty', '-m', 'docs: explain forecast windows');
  git(
    'commit',
    '--allow-empty',
    '-m',
    'test: cover missing forecasts',
    '--author',
    'A [Maintainer] <private@example.invalid>',
  );
  assert.throws(() => release('patch'), /at least a minor/);
  assert.equal((await read('package.json')).version, '1.0.0');
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(release('minor'), '1.1.0');
  const body = await notes();
  for (const heading of ['Features', 'Bug Fixes', 'Performance', 'Documentation', 'Maintenance'])
    assert.ok(body.includes(`### ${heading}`));
  assert.match(body, /by @weather-dev/);
  assert.ok(body.includes('by A \\[Maintainer\\]'));
  assert.doesNotMatch(body, /private@example.invalid/);
  assert.equal(body.split('\n').filter((line) => line.startsWith('- ')).length, 5);
});

for (const message of [
  'feat(api)!: remove legacy field',
  'refactor: simplify config\n\nBREAKING CHANGE: remove the legacy field',
  'fix: reject legacy values\n\nBREAKING-CHANGE: remove the legacy field',
]) {
  test(`breaking changes require a major release: ${message.split('\n')[0]}`, async (t) => {
    const { git, release, read, notes } = await fixture(t);
    git('tag', 'v1.0.0');
    git('commit', '--allow-empty', '-m', message);
    assert.throws(() => release('patch'), /at least a major/);
    assert.throws(() => release('minor'), /at least a major/);
    assert.equal((await read('package.json')).version, '1.0.0');
    assert.equal(release('major'), '2.0.0');
    assert.match(await notes(), /### Breaking Changes/);
    assert.match(await notes(), /compare\/v1\.0\.0\.\.\.v2\.0\.0/);
  });
}

test('repository fallback uses the GHCR manifest and invalid repository fails before mutation', async (t) => {
  const { release, git, notes } = await fixture(t);
  assert.throws(
    () => release('initial', { GITHUB_REPOSITORY: 'not a repository' }),
    /Set GITHUB_REPOSITORY/,
  );
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(release('initial', { GITHUB_REPOSITORY: '' }), '1.0.0');
  assert.match(await notes(), /https:\/\/github.com\/valentinhttr\/gladys-meteoswiss\/commit\//);
});

for (const available of [true, false]) {
  test(`GitHub author lookup ${available ? 'uses the verified handle' : 'falls back to Git author on API failure'}`, async (t) => {
    const { release, notes } = await fixture(t);
    const bin = await mkdtemp(join(tmpdir(), 'meteoswiss-gh-'));
    t.after(() => rm(bin, { recursive: true, force: true }));
    const mock = join(bin, 'gh');
    await writeFile(
      mock,
      `#!/usr/bin/env node\n${available ? "process.stdout.write('verified-author\\n');" : 'process.exit(1);'}\n`,
    );
    await chmod(mock, 0o755);
    assert.equal(
      release('initial', { GH_TOKEN: 'test-only', PATH: `${bin}:${process.env.PATH}` }),
      '1.0.0',
    );
    assert.ok((await notes()).includes(available ? 'by @verified-author' : 'by Test Author'));
  });
}
