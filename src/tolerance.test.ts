import { describe, expect, it } from 'vitest';
import {
  kanToleranceColimit,
  kanDeduplicateByTolerance,
  kanDeduplicateByPairs,
} from './tolerance.js';

describe('kanToleranceColimit', () => {
  it('keeps the higher-importance side of each pair and absorbs the other', () => {
    const items = [
      { id: 'a', importance: 1 },
      { id: 'b', importance: 5 },
      { id: 'c', importance: 3 },
    ];
    // Highest-similarity pair (a-b @ 0.95) is processed first: b kept, a absorbed.
    // Next pair (b-c @ 0.93): b is still available (kept ≠ absorbed), c is too.
    //   b > c, so c is absorbed into b.
    const pairs = [
      { a: items[0]!, b: items[1]!, similarity: 0.95 },
      { a: items[1]!, b: items[2]!, similarity: 0.93 },
    ];
    const result = kanToleranceColimit({
      items,
      pairs,
      colimitOp: (keep) => keep.id,
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.kept.id).toBe('b');
    expect(result[0]!.removed.id).toBe('a');
    expect(result[1]!.kept.id).toBe('b');
    expect(result[1]!.removed.id).toBe('c');
  });

  it('processes higher-similarity pairs first (greedy ordering)', () => {
    const items = [
      { id: 'a', importance: 1 },
      { id: 'b', importance: 1 },
      { id: 'c', importance: 10 },
    ];
    const result = kanToleranceColimit({
      items,
      pairs: [
        { a: items[0]!, b: items[1]!, similarity: 0.91 },
        { a: items[1]!, b: items[2]!, similarity: 0.99 },
      ],
      colimitOp: () => undefined,
    });
    // Highest similarity (b-c) processed first; b absorbed by c.
    // Then a-b pair: b already absorbed -> skipped.
    expect(result).toHaveLength(1);
    expect(result[0]!.kept.id).toBe('c');
    expect(result[0]!.removed.id).toBe('b');
  });
});

describe('kanDeduplicateByTolerance', () => {
  it('returns the input untouched when fewer than 2 items', () => {
    const r = kanDeduplicateByTolerance({
      items: [{ id: 'only' }],
      similarityOf: () => 1,
      threshold: 0.5,
      keepScoreOf: () => 1,
    });
    expect(r.kept).toHaveLength(1);
    expect(r.absorbed.size).toBe(0);
  });

  it('preserves input order in `kept`', () => {
    const items = [
      { id: 'a', score: 1 },
      { id: 'b', score: 2 },
      { id: 'c', score: 3 },
    ];
    const r = kanDeduplicateByTolerance({
      items,
      similarityOf: (x, y) => (x.id === 'a' && y.id === 'c' ? 0.99 : 0),
      threshold: 0.9,
      keepScoreOf: (x) => x.score,
    });
    // a/c are similar; c has higher score -> a is absorbed
    expect(r.kept.map((x) => x.id)).toEqual(['b', 'c']);
    expect(r.absorbed.get('a')?.keptId).toBe('c');
  });

  it('calls onMerge for every absorbed pair', () => {
    const calls: string[] = [];
    kanDeduplicateByTolerance({
      items: [
        { id: 'a', score: 1 },
        { id: 'b', score: 2 },
      ],
      similarityOf: () => 1,
      threshold: 0.5,
      keepScoreOf: (x) => x.score,
      onMerge: (keep, remove) => calls.push(`${remove.id}->${keep.id}`),
    });
    expect(calls).toEqual(['a->b']);
  });
});

describe('kanDeduplicateByPairs', () => {
  it('silently ignores pairs whose ids are not in items (quotient safety)', () => {
    const r = kanDeduplicateByPairs({
      items: [{ id: 'a', score: 1 }],
      pairs: [{ aId: 'a', bId: 'ghost', similarity: 0.99 }],
      keepScoreOf: (x) => x.score,
    });
    expect(r.kept).toHaveLength(1);
    expect(r.absorbed.size).toBe(0);
  });

  it('does not double-absorb (idempotency of the quotient map)', () => {
    const items = [
      { id: 'a', score: 3 },
      { id: 'b', score: 1 },
      { id: 'c', score: 2 },
    ];
    const r = kanDeduplicateByPairs({
      items,
      pairs: [
        { aId: 'a', bId: 'b', similarity: 0.99 },
        { aId: 'b', bId: 'c', similarity: 0.97 }, // b is already absorbed by a; skip
      ],
      keepScoreOf: (x) => x.score,
    });
    expect(r.kept.map((x) => x.id).sort()).toEqual(['a', 'c']);
    expect(r.absorbed.get('b')?.keptId).toBe('a');
    expect(r.absorbed.has('c')).toBe(false);
  });
});
