import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import Ajv from 'ajv';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = read('gladys-assistant-integration.json');
const pkg = read('package.json');
const lock = read('package-lock.json');
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
const validate = ajv.compile(read('test/fixtures/manifest.schema.json'));
if (!validate(manifest)) throw new Error(JSON.stringify(validate.errors));
if (
  pkg.version !== manifest.version ||
  pkg.version !== lock.version ||
  pkg.version !== lock.packages[''].version ||
  !manifest.docker_image.endsWith(`:${pkg.version}`)
) {
  throw new Error('Package, lockfile and manifest versions must match');
}
if (pkg.dependencies['@gladysassistant/integration-sdk'] !== '0.14.0')
  throw new Error('SDK version drift');
function translations(value) {
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, 'en') && !value.fr) throw new Error('Missing French translation');
  for (const child of Object.values(value)) translations(child);
}
translations(manifest);
for (const widget of manifest.widgets) {
  for (const value of Object.values(widget.label)) {
    if (value.length < 3 || value.length > 30) throw new Error('Widget label length');
  }
  for (const value of Object.values(widget.description)) {
    if (value.length > 100) throw new Error('Widget description length');
  }
}
for (const dir of ['src', 'scripts', 'test']) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.js'))) {
    execFileSync(process.execPath, ['--check', `${dir}/${file}`]);
  }
}
console.log('Manifest, translations, versions and JavaScript syntax OK');
