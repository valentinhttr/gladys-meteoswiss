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
const lock = read('package-lock.json');
const manifest = read('gladys-assistant-integration.json');
const repository =
  process.env.GITHUB_REPOSITORY || /^ghcr\.io\/([^/]+\/[^/:]+):/.exec(manifest.docker_image)?.[1];
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? ''))
  throw new Error('Set GITHUB_REPOSITORY to owner/repository');
const repositoryUrl = `https://github.com/${repository}`;
const markdown = (value) => value.replace(/[\\`*_\[\]<>]/g, '\\$&');
function authorCredit(hash, name, email) {
  // Prefer GitHub's verified mapping, never guess a username from a display name.
  if (process.env.GH_TOKEN) {
    try {
      const login = execFileSync(
        'gh',
        ['api', `repos/${repository}/commits/${hash}`, '--jq', '.author.login // empty'],
        {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15_000,
        },
      ).trim();
      if (/^[A-Za-z0-9-]+(?:\[bot\])?$/.test(login)) return `@${login}`;
    } catch {
      console.warn(
        `GitHub author lookup unavailable for ${hash.slice(0, 7)}; using Git attribution`,
      );
    }
  }
  const login = /^(?:\d+\+)?([A-Za-z0-9-]+(?:\[bot\])?)@users\.noreply\.github\.com$/.exec(
    email,
  )?.[1];
  return login ? `@${login}` : markdown(name);
}
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
// NUL-delimited fields preserve multiline bodies (including breaking-change footers).
const fields = git('log', range, '-z', '--format=%H%x00%s%x00%aN%x00%aE%x00%B').split('\0');
const commits = [];
for (let i = 0; i + 4 < fields.length; i += 5) {
  const [hash, subject, author, email, body] = fields.slice(i, i + 5);
  if (/^chore\(release\):/i.test(subject)) continue;
  const match = /^(\w+)(?:\([^)]+\))?(!)?:\s*(.+)$/.exec(subject);
  commits.push({
    hash,
    subject,
    author,
    email,
    type: match?.[1].toLowerCase(),
    breaking: Boolean(match?.[2] || /^BREAKING(?: |-)CHANGE:\s+\S/m.test(body)),
  });
}
if (!commits.length) throw new Error('No changes to release');
const minimum = commits.some((commit) => commit.breaking)
  ? 'major'
  : commits.some((commit) => commit.type === 'feat')
    ? 'minor'
    : 'patch';
if (
  type !== 'initial' &&
  ['patch', 'minor', 'major'].indexOf(type) < ['patch', 'minor', 'major'].indexOf(minimum)
)
  throw new Error(`Commits require at least a ${minimum} release`);
const groups = new Map([
  ['Breaking Changes', []],
  ['Features', []],
  ['Bug Fixes', []],
  ['Performance', []],
  ['Documentation', []],
  ['Maintenance', []],
]);
const categories = {
  feat: 'Features',
  fix: 'Bug Fixes',
  perf: 'Performance',
  docs: 'Documentation',
};
for (const commit of commits) {
  const { hash, subject, author, email, breaking } = commit;
  const group = breaking
    ? 'Breaking Changes'
    : Object.hasOwn(categories, commit.type)
      ? categories[commit.type]
      : 'Maintenance';
  groups
    .get(group)
    .push(
      `- ${markdown(subject)} ([${hash.slice(0, 7)}](${repositoryUrl}/commit/${hash})) by ${authorCredit(hash, author, email)}`,
    );
}
const historyUrl = previous
  ? `${repositoryUrl}/compare/${previous}...v${version}`
  : `${repositoryUrl}/commits/v${version}`;
const notes =
  `## ${version} (${new Date().toISOString().slice(0, 10)})\n\n` +
  [...groups]
    .filter(([, items]) => items.length)
    .map(([title, items]) => `### ${title}\n\n${items.join('\n')}\n`)
    .join('\n') +
  `\n**Full Changelog**: ${historyUrl}\n`;
pkg.version = lock.version = lock.packages[''].version = manifest.version = version;
manifest.docker_image = `ghcr.io/${repository.toLowerCase()}:${version}`;
write('package.json', pkg);
write('package-lock.json', lock);
write('gladys-assistant-integration.json', manifest);
const existing = readFileSync('CHANGELOG.md', 'utf8').replace(/^# Changelog\s*/, '');
writeFileSync('CHANGELOG.md', `# Changelog\n\n${notes}\n${existing}`);
writeFileSync('release-notes.md', notes);
console.log(version);
