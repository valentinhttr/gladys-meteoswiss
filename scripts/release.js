import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const type = process.argv[2];
if (!['initial', 'patch', 'minor', 'major'].includes(type))
  throw new Error('Choose initial, patch, minor or major');
if (git('status', '--porcelain')) throw new Error('Release requires a clean working tree');
const pkg = read('package.json');
const versions = git('tag', '--list', 'v*', '--sort=-version:refname')
  .split('\n')
  .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
const previous = versions[0];
if (type === 'initial' && previous) throw new Error('Initial release already exists');
if (type !== 'initial' && !previous) throw new Error('Use initial for the first release');
if (previous && pkg.version !== previous.slice(1))
  throw new Error('Release from the latest version');
if (previous) git('merge-base', '--is-ancestor', previous, 'HEAD');
const [major, minor, patch] = pkg.version.split('.').map(Number);
const version =
  type === 'initial'
    ? pkg.version
    : type === 'major'
      ? `${major + 1}.0.0`
      : type === 'minor'
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`;
const range = previous ? `${previous}..HEAD` : 'HEAD';
const commits = git('log', range, '--format=%s%x09%h').split('\n').filter(Boolean);
const groups = new Map([
  ['Breaking changes / Changements incompatibles', []],
  ['Features / Fonctionnalités', []],
  ['Fixes / Corrections', []],
  ['Maintenance', []],
]);
for (const line of commits) {
  const tab = line.lastIndexOf('\t');
  const subject = line.slice(0, tab);
  const hash = line.slice(tab + 1);
  if (/^chore\(release\):/.test(subject)) continue;
  const match = /^(\w+)(?:\([^)]+\))?(!)?:\s*(.+)$/.exec(subject);
  const group = match?.[2]
    ? [...groups.keys()][0]
    : match?.[1] === 'feat'
      ? [...groups.keys()][1]
      : match?.[1] === 'fix'
        ? [...groups.keys()][2]
        : 'Maintenance';
  groups.get(group).push(`- ${subject} (${hash})`);
}
if (![...groups.values()].some((items) => items.length)) throw new Error('No changes to release');
const notes =
  `## ${version} (${new Date().toISOString().slice(0, 10)})\n\n` +
  [...groups]
    .filter(([, items]) => items.length)
    .map(([title, items]) => `### ${title}\n\n${items.join('\n')}\n`)
    .join('\n');
const lock = read('package-lock.json');
const manifest = read('gladys-assistant-integration.json');
pkg.version = lock.version = lock.packages[''].version = manifest.version = version;
const repository = process.env.GITHUB_REPOSITORY;
if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
  throw new Error('Invalid repository');
manifest.docker_image = repository
  ? `ghcr.io/${repository.toLowerCase()}:${version}`
  : manifest.docker_image.replace(/:[^:]+$/, `:${version}`);
write('package.json', pkg);
write('package-lock.json', lock);
write('gladys-assistant-integration.json', manifest);
const existing = readFileSync('CHANGELOG.md', 'utf8').replace(/^# Changelog\s*/, '');
writeFileSync('CHANGELOG.md', `# Changelog\n\n${notes}\n${existing}`);
writeFileSync('release-notes.md', notes);
console.log(version);
