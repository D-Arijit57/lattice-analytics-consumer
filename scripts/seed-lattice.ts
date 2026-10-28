/**
 * Demo helper: creates the "Metric Record" content type, its fields, a published version, the demo
 * entries and a read-only API key in a Lattice organization, using Lattice's public control-plane API
 * (login cookies). It never touches the Lattice database. Point it at a LOCAL Lattice only.
 *
 *   LATTICE_API_BASE_URL=http://localhost:8000/api SEED_EMAIL=you@example.com SEED_PASSWORD=... npm run seed
 *
 * SEED_DATASET=showcase seeds the small hand-enterable set (default: the 14-day demo set).
 * A non-local Lattice is refused unless SEED_ALLOW_REMOTE=true (it then writes real data to that instance).
 *
 * By default it creates a new organization. Set SEED_ORG_ID to reuse an organization you belong to.
 * Lattice has no update or delete, so running it twice adds more entries (and fails on the duplicate
 * content type slug when reusing an organization).
 */
import {DEMO_CONTENT_TYPE, DEMO_FIELDS, generateDemoData, generateShowcaseData} from '../shared/demo-data.ts';

const base = (process.env.LATTICE_API_BASE_URL ?? 'http://localhost:8000/api').replace(/\/+$/, '');
const email = process.env.SEED_EMAIL;
const password = process.env.SEED_PASSWORD;
if (!email || !password) {
  console.error('Set SEED_EMAIL and SEED_PASSWORD.');
  process.exit(1);
}
if (process.env.SEED_ALLOW_REMOTE !== 'true' && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) {
  console.error(`Refusing to seed non-local Lattice at ${base}. Set SEED_ALLOW_REMOTE=true to seed it anyway.`);
  process.exit(1);
}

let cookies = '';
async function call(method: string, path: string, body?: unknown, okStatuses = [200, 201]) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {'Content-Type': 'application/json', ...(cookies ? {Cookie: cookies} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length) cookies = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!okStatuses.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

await call('POST', '/auth/signup/', {name: 'Analytics Seed', email, password}, [201, 400]);
await call('POST', '/auth/login/', {email, password});
const orgId = process.env.SEED_ORG_ID ?? (await call('POST', '/organizations/', {name: `Analytics Demo ${new Date().toISOString().slice(0, 16)}`})).id;
const o = `/organizations/${orgId}`;
const ct = await call('POST', `${o}/content-types/`, DEMO_CONTENT_TYPE);
const f = `${o}/content-types/${ct.id}`;
for (const field of DEMO_FIELDS) await call('POST', `${f}/fields/`, field);
await call('POST', `${f}/versions/`, {});

const data = process.env.SEED_DATASET === 'showcase' ? generateShowcaseData() : generateDemoData();
for (const d of data) await call('POST', `${f}/entries/`, {data: d});

const key = await call('POST', `${o}/api-keys/`, {name: 'analytics-readonly'});
console.log(`org=${orgId} content_type=${ct.id} slug=${DEMO_CONTENT_TYPE.slug} entries=${data.length}`);
console.log(`LATTICE_API_KEY=${key.key}`);
