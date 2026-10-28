import {describe, expect, it} from 'vitest';
import {loadConfig} from './config.ts';

const base = {LATTICE_API_BASE_URL: 'http://localhost:8000/api/', LATTICE_API_KEY: 'lat_abc'};

describe('loadConfig', () => {
  it('applies defaults and trims the trailing slash', () => {
    const c = loadConfig(base);
    expect(c.lattice).toMatchObject({baseUrl: 'http://localhost:8000/api', contentTypeSlug: 'metric-record'});
    expect(c).toMatchObject({demo: false, port: 3004, cacheTtlMs: 30_000, refreshIntervalMs: 60_000});
  });

  it('reports every problem at once without echoing secret values', () => {
    const run = () => loadConfig({LATTICE_API_BASE_URL: 'ftp://x', LATTICE_API_KEY: 'sk_super_secret', LATTICE_METRIC_CONTENT_TYPE: 'Bad Slug', PORT: '0'});
    expect(run).toThrow(/LATTICE_API_BASE_URL[\s\S]*LATTICE_API_KEY[\s\S]*LATTICE_METRIC_CONTENT_TYPE[\s\S]*PORT/);
    expect(() => run()).not.toThrow(/super_secret/);
  });

  it('rejects the placeholder key and a missing key', () => {
    expect(() => loadConfig({...base, LATTICE_API_KEY: 'lat_replace_me'})).toThrow(/LATTICE_API_KEY/);
    expect(() => loadConfig({LATTICE_API_BASE_URL: base.LATTICE_API_BASE_URL})).toThrow(/LATTICE_API_KEY/);
  });

  it('parses and validates LATTICE_FIELD_MAP', () => {
    expect(loadConfig({...base, LATTICE_FIELD_MAP: '{"recordedAt":"logged_on"}'}).lattice?.fieldMap.recordedAt).toBe('logged_on');
    expect(() => loadConfig({...base, LATTICE_FIELD_MAP: '{"nope":"x"}'})).toThrow(/unknown key/);
    expect(() => loadConfig({...base, LATTICE_FIELD_MAP: '[1]'})).toThrow(/JSON object/);
    expect(() => loadConfig({...base, LATTICE_FIELD_MAP: '{bad'})).toThrow(/valid JSON/);
  });

  it('enforces a conservative minimum refresh interval', () => {
    expect(() => loadConfig({...base, ANALYTICS_REFRESH_INTERVAL_SECONDS: '5'})).toThrow(/ANALYTICS_REFRESH_INTERVAL_SECONDS/);
    expect(loadConfig({...base, ANALYTICS_REFRESH_INTERVAL_SECONDS: '120'}).refreshIntervalMs).toBe(120_000);
  });

  it('demo mode needs no Lattice settings and has no Lattice config', () => {
    const c = loadConfig({ANALYTICS_DEMO_MODE: 'true'});
    expect(c).toMatchObject({demo: true, lattice: null});
  });
});
