import {DEFAULT_FIELD_MAP, type FieldMap} from '../shared/normalize.ts';

export interface LatticeConfig {
  baseUrl: string; // e.g. http://localhost:8000/api (no trailing slash)
  apiKey: string;
  contentTypeSlug: string;
  fieldMap: FieldMap;
}

export interface AppConfig {
  /** Null in demo mode: no Lattice connection is made and no key is needed. */
  lattice: LatticeConfig | null;
  demo: boolean;
  port: number;
  cacheTtlMs: number;
  refreshIntervalMs: number;
}

export const DEFAULT_SLUG = 'metric-record';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** LATTICE_FIELD_MAP is a JSON object overriding some of the default role -> Lattice field names. */
function parseFieldMap(raw: string | undefined, problems: string[]): FieldMap {
  const map = {...DEFAULT_FIELD_MAP};
  if (!raw?.trim()) return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    problems.push('LATTICE_FIELD_MAP must be valid JSON, e.g. {"recordedAt":"logged_on"}');
    return map;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    problems.push('LATTICE_FIELD_MAP must be a JSON object');
    return map;
  }
  for (const [role, field] of Object.entries(parsed)) {
    if (!(role in DEFAULT_FIELD_MAP)) {
      problems.push(`LATTICE_FIELD_MAP has unknown key "${role}" (allowed: ${Object.keys(DEFAULT_FIELD_MAP).join(', ')})`);
    } else if (typeof field !== 'string' || !field.trim()) {
      problems.push(`LATTICE_FIELD_MAP["${role}"] must be a non-empty field name`);
    } else {
      map[role as keyof FieldMap] = field.trim();
    }
  }
  return map;
}

/** Reads and validates environment variables. Throws one error listing every problem, never a secret value. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];
  const demo = env.ANALYTICS_DEMO_MODE?.trim().toLowerCase() === 'true';

  let lattice: LatticeConfig | null = null;
  if (!demo) {
    const rawBase = env.LATTICE_API_BASE_URL?.trim() ?? '';
    let baseUrl = '';
    try {
      const u = new URL(rawBase);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
      baseUrl = rawBase.replace(/\/+$/, '');
    } catch {
      problems.push('LATTICE_API_BASE_URL must be an http(s) URL such as http://localhost:8000/api');
    }

    const apiKey = env.LATTICE_API_KEY?.trim() ?? '';
    if (!apiKey.startsWith('lat_') || apiKey === 'lat_replace_me') {
      problems.push('LATTICE_API_KEY must be a real Lattice key (starts with "lat_")');
    }

    const slug = env.LATTICE_METRIC_CONTENT_TYPE?.trim() || DEFAULT_SLUG;
    if (!SLUG.test(slug)) problems.push('LATTICE_METRIC_CONTENT_TYPE must be a Lattice slug such as "metric-record"');

    const fieldMap = parseFieldMap(env.LATTICE_FIELD_MAP, problems);
    lattice = {baseUrl, apiKey, contentTypeSlug: slug, fieldMap};
  }

  const port = Number(env.PORT ?? 3004);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT must be 1-65535');

  const ttl = Number(env.RECORDS_CACHE_TTL_SECONDS ?? 30);
  if (!Number.isFinite(ttl) || ttl < 0) problems.push('RECORDS_CACHE_TTL_SECONDS must be >= 0');

  // Lattice allows 60 requests/min per key and a refresh may need several pages, so polling stays conservative.
  const refresh = Number(env.ANALYTICS_REFRESH_INTERVAL_SECONDS ?? 60);
  if (!Number.isFinite(refresh) || refresh < 15) problems.push('ANALYTICS_REFRESH_INTERVAL_SECONDS must be >= 15');

  if (problems.length) throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  return {lattice, demo, port, cacheTtlMs: ttl * 1000, refreshIntervalMs: refresh * 1000};
}
