import { describe, expect, it } from 'vitest';
import {
  kanExtend,
  kanMergeStrings,
  kanMergeHistory,
  kanColimitWeighted,
  type HistoryEntry,
} from './kan-extension.js';

describe('kanExtend', () => {
  it('reduces to colimitOp over the comma slice', () => {
    const result = kanExtend<string, number, number>({
      target: 10,
      indexer: () => ({
        indices: ['a', 'b', 'c'],
        weights: new Map([
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ]),
      }),
      functorG: (i) => i.charCodeAt(0),
      colimitOp: (target, contributions) =>
        contributions.reduce((acc, { value, weight }) => acc + value * weight, target),
    });
    expect(result).toBe(10 + 97 * 1 + 98 * 2 + 99 * 3);
  });

  it('returns the target unchanged when the comma slice is empty', () => {
    const result = kanExtend<string, string, string>({
      target: 'seed',
      indexer: () => ({ indices: [], weights: new Map() }),
      functorG: (i) => i,
      colimitOp: (target, contributions) =>
        contributions.length === 0 ? target : contributions.map((c) => c.value).join(','),
    });
    expect(result).toBe('seed');
  });
});

describe('kanMergeStrings (G-Set CRDT)', () => {
  it('deduplicates by trimmed equality', () => {
    expect(kanMergeStrings(['a', ' a ', 'b'], [' b', 'c '])).toEqual(
      expect.arrayContaining(['a', 'b', 'c']),
    );
    expect(kanMergeStrings(['a', ' a ', 'b'], [' b', 'c '])).toHaveLength(3);
  });

  it('is commutative (a join-semilattice merge)', () => {
    const a = ['x', 'y'];
    const b = ['y', 'z'];
    expect(new Set(kanMergeStrings(a, b))).toEqual(new Set(kanMergeStrings(b, a)));
  });

  it('is idempotent', () => {
    const a = ['x', 'y', 'z'];
    expect(new Set(kanMergeStrings(a, a))).toEqual(new Set(a));
  });

  it('drops empty / whitespace-only strings', () => {
    expect(kanMergeStrings(['', '  ', 'a'], ['b', ''])).toEqual(
      expect.arrayContaining(['a', 'b']),
    );
    expect(kanMergeStrings(['', '  '], [''])).toEqual([]);
  });

  it('ignores non-string values in incoming', () => {
    // simulate runtime garbage from untyped sources
    const dirty = [42 as unknown as string, 'real'];
    expect(kanMergeStrings(['base'], dirty)).toEqual(
      expect.arrayContaining(['base', 'real']),
    );
  });
});

describe('kanMergeHistory (LWW-Register CRDT)', () => {
  const e = (overrides: Partial<HistoryEntry>): HistoryEntry => ({
    table: 'users',
    action: 'create',
    appliedAt: '2026-01-01T00:00:00Z',
    ddl: 'CREATE TABLE users (id INT);',
    ...overrides,
  });

  it('collapses entries with the same key to the latest content', () => {
    const base = [e({ appliedAt: '2026-01-01T00:00:00Z', ddl: 'OLD' })];
    const incoming = [e({ appliedAt: '2026-01-01T00:00:00Z', ddl: 'NEW' })];
    const merged = kanMergeHistory(base, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.ddl).toBe('NEW');
  });

  it('keeps distinct keys side by side, sorted by appliedAt', () => {
    const merged = kanMergeHistory(
      [e({ appliedAt: '2026-01-03T00:00:00Z' })],
      [
        e({ appliedAt: '2026-01-01T00:00:00Z' }),
        e({ appliedAt: '2026-01-02T00:00:00Z' }),
      ],
    );
    expect(merged.map((m) => m.appliedAt)).toEqual([
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      '2026-01-03T00:00:00Z',
    ]);
  });

  it('ignores nullish entries', () => {
    const incoming = [null as unknown as HistoryEntry, e({})];
    expect(kanMergeHistory([], incoming)).toHaveLength(1);
  });
});

describe('kanColimitWeighted', () => {
  it('keeps the higher importance and picks its id when classes collide', () => {
    const base = [{ id: 'a1', content: 'hello', importance: 5 }];
    const incoming = [{ id: 'b1', content: 'hello', importance: 10 }];
    const merged = kanColimitWeighted(base, incoming);
    expect(merged).toEqual([{ id: 'b1', content: 'hello', importance: 10 }]);
  });

  it('breaks ties by preferring the existing id', () => {
    const base = [{ id: 'a1', content: 'x', importance: 5 }];
    const incoming = [{ id: 'b1', content: 'x', importance: 5 }];
    expect(kanColimitWeighted(base, incoming)[0]!.id).toBe('a1');
  });

  it('returns results in descending importance order', () => {
    const merged = kanColimitWeighted(
      [
        { id: '1', content: 'low', importance: 1 },
        { id: '2', content: 'high', importance: 10 },
      ],
      [{ id: '3', content: 'mid', importance: 5 }],
    );
    expect(merged.map((m) => m.content)).toEqual(['high', 'mid', 'low']);
  });

  it('drops entries with empty content', () => {
    expect(
      kanColimitWeighted([{ id: 'a', content: '  ', importance: 1 }], []),
    ).toEqual([]);
  });
});
