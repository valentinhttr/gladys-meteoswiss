import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

test('the catalog countries: Switzerland, which needs Gladys >= 5.3.0', () => {
  assert.deepEqual(manifest.countries, ['CH']);
  const [major, minor] = manifest.gladys_version
    .match(/>=\s*(\d+)\.(\d+)/)
    .slice(1)
    .map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 3), 'countries needs Gladys 5.3.0');
});
