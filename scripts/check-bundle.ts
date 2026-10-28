/**
 * Fails if the built browser bundle in dist/ could contain a Lattice credential: any `lat_` key-shaped
 * string, any VITE_ variable name that looks secret, or the value of LATTICE_API_KEY from the environment/.env.
 * Run after `npm run build`.
 */
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

try {
  process.loadEnvFile();
} catch {
  /* no .env */
}

const root = new URL('../dist', import.meta.url).pathname;
const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p) : /\.(js|css|html|map)$/.test(name) && files.push(p);
  }
})(root);

const problems: string[] = [];
const secret = process.env.LATTICE_API_KEY?.trim();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  if (/\blat_[A-Za-z0-9_-]{8,}/.test(text)) problems.push(`${f}: contains a lat_ key-shaped string`);
  if (secret && secret.length > 8 && !secret.endsWith('replace_me') && text.includes(secret)) problems.push(`${f}: contains the configured LATTICE_API_KEY`);
  if (/VITE_[A-Z_]*(KEY|SECRET|TOKEN)/.test(text)) problems.push(`${f}: references a secret-looking VITE_ variable`);
}
if (files.length === 0) problems.push('dist/ has no files: run "npm run build" first');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Bundle check passed: ${files.length} files scanned, no credentials found.`);
