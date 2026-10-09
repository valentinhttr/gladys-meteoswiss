import { readFileSync, writeFileSync } from 'node:fs';

const repository = process.argv[2];
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
  throw new Error('Usage: npm run setup:repository -- owner/repository');
}
const path = 'gladys-assistant-integration.json';
const manifest = JSON.parse(readFileSync(path, 'utf8'));
manifest.docker_image = `ghcr.io/${repository.toLowerCase()}:${manifest.version}`;
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Docker repository: ghcr.io/${repository.toLowerCase()}`);
