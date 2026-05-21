import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  contentSimilarity,
  buildHybridSimilarity,
} from './similarity.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical non-zero vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('is symmetric', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
  });

  it('returns 0 for empty / mismatched / zero inputs', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe('contentSimilarity', () => {
  it('is 1 for exact-after-normalization matches', () => {
    expect(contentSimilarity('Hello World', 'hello world')).toBe(1);
    expect(contentSimilarity('a, b, c', 'a b c')).toBe(1);
  });

  it('is 0.95 for containment', () => {
    expect(contentSimilarity('hello world', 'hello world wide')).toBe(0.95);
  });

  it('returns Jaccard for partial overlap', () => {
    const sim = contentSimilarity('abcdef', 'abcxyz');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('returns 0 for empty inputs', () => {
    expect(contentSimilarity('', 'something')).toBe(0);
    expect(contentSimilarity('', '')).toBe(0);
  });
});

describe('buildHybridSimilarity', () => {
  type Rec = { id: string; content: string; embedding: number[] | null };
  const factory = buildHybridSimilarity<Rec>({
    getEmbedding: (r) => r.embedding,
    cosineThreshold: 0.9,
    contentThreshold: 0.8,
  });

  it('uses cosine when both records carry usable embeddings', () => {
    const a: Rec = { id: 'a', content: 'foo', embedding: [1, 0, 0] };
    const b: Rec = { id: 'b', content: 'bar', embedding: [1, 0, 0] };
    expect(factory.similarityOf(a, b)).toBeCloseTo(1);
    expect(factory.isEquivalent(a, b, 1)).toBe(true);
  });

  it('falls back to content similarity when an embedding is missing', () => {
    const a: Rec = { id: 'a', content: 'hello world', embedding: null };
    const b: Rec = { id: 'b', content: 'hello world', embedding: null };
    expect(factory.similarityOf(a, b)).toBe(1);
    expect(factory.isEquivalent(a, b, 1)).toBe(true);
  });

  it('applies the correct threshold per path', () => {
    const cosA: Rec = { id: 'a', content: 'x', embedding: [1, 0] };
    const cosB: Rec = { id: 'b', content: 'y', embedding: [1, 0] };
    // sim=0.85: cosine path requires 0.9 -> not equivalent
    expect(factory.isEquivalent(cosA, cosB, 0.85)).toBe(false);

    const txtA: Rec = { id: 'a', content: 'x', embedding: null };
    const txtB: Rec = { id: 'b', content: 'y', embedding: null };
    // sim=0.85: content path requires 0.8 -> equivalent
    expect(factory.isEquivalent(txtA, txtB, 0.85)).toBe(true);
  });
});
