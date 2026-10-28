import {describe, expect, it} from 'vitest';
import {normalizeEntry, parseTimestamp} from './normalize.ts';

const entry = (data: unknown, id: unknown = 1) => ({id, data});

describe('parseTimestamp', () => {
  it('accepts a real calendar day', () => expect(parseTimestamp('2026-10-05')).toBe('2026-10-05'));
  it('rejects impossible days', () => {
    expect(parseTimestamp('2026-02-31')).toBeNull();
    expect(parseTimestamp('2026-13-01')).toBeNull();
  });
  it('converts offsets to a UTC instant', () => expect(parseTimestamp('2026-10-05T10:00:00+05:30')).toBe('2026-10-05T04:30:00.000Z'));
  it('rejects date-times without an offset (ambiguous)', () => expect(parseTimestamp('2026-10-05T10:00:00')).toBeNull());
  it('rejects garbage and non-strings', () => {
    for (const v of ['yesterday', '', '  ', 12, null, undefined, {}]) expect(parseTimestamp(v)).toBeNull();
  });
});

describe('normalizeEntry', () => {
  it('reads a complete entry', () => {
    const r = normalizeEntry(entry({name: ' Docs ', category: 'Docs', value: 10, recorded_at: '2026-10-05', status: ' Active ', target: 12, unit: 'views'}, 7));
    expect(r).toEqual({
      ok: true,
      issues: [],
      record: {id: '7', name: 'Docs', category: 'Docs', value: 10, recordedAt: '2026-10-05', status: 'active', target: 12, unit: 'views'},
    });
  });

  it('keeps a record with only optional fields missing and reports nothing extra', () => {
    const r = normalizeEntry(entry({name: 'A', value: 1, recorded_at: '2026-10-05'}));
    expect(r.ok && r.record).toMatchObject({category: null, status: null, target: null, unit: null});
    expect(r.ok && r.issues).toEqual([]);
  });

  it('nulls invalid numbers instead of dropping the record', () => {
    for (const bad of ['12', NaN, Infinity, true, {}, []]) {
      const r = normalizeEntry(entry({name: 'A', value: bad, target: bad}));
      expect(r.ok && r.record.value).toBeNull();
      expect(r.ok && r.record.target).toBeNull();
      expect(r.ok && r.issues).toContain('invalid_value');
      expect(r.ok && r.issues).toContain('invalid_target');
    }
  });

  it('distinguishes missing from invalid', () => {
    const r = normalizeEntry(entry({value: null, recorded_at: 'nope'}));
    expect(r.ok && r.issues).toEqual(['missing_name', 'missing_value', 'invalid_timestamp']);
    const m = normalizeEntry(entry({name: 'A', value: 1}));
    expect(m.ok && m.issues).toEqual(['missing_timestamp']);
  });

  it('treats empty strings as missing', () => {
    const r = normalizeEntry(entry({name: '  ', category: '', status: ' ', value: 1, recorded_at: '2026-10-05'}));
    expect(r.ok && r.record).toMatchObject({name: null, category: null, status: null});
  });

  it('rejects unreadable entries', () => {
    expect(normalizeEntry(null)).toMatchObject({ok: false});
    expect(normalizeEntry({data: {}})).toMatchObject({ok: false, reason: 'Entry has no id.'});
    for (const data of [null, [], 'x', 3]) expect(normalizeEntry({id: 1, data})).toMatchObject({ok: false, id: '1'});
  });

  it('honours a custom field map', () => {
    const r = normalizeEntry(entry({title: 'T', amount: 5, logged_on: '2026-10-05'}), {
      name: 'title', category: 'category', value: 'amount', recordedAt: 'logged_on', status: 'status', target: 'target', unit: 'unit',
    });
    expect(r.ok && r.record).toMatchObject({name: 'T', value: 5, recordedAt: '2026-10-05'});
  });
});
