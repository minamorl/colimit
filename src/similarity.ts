/**
 * Similarity primitives — the equivalence relations you usually plug into
 * {@link ../tolerance.ts | tolerance colimits}.
 *
 * Two families are provided:
 *   - `cosineSimilarity` for dense vectors (embeddings).
 *   - `contentSimilarity` for short strings without an embedding model.
 * And a hybrid factory `buildHybridSimilarity` that picks per record.
 */

/**
 * Cosine similarity in [-1, 1] (typically [0, 1] for text embeddings).
 *
 * Properties:
 *   - Symmetric: cosineSimilarity(a, b) === cosineSimilarity(b, a)
 *   - Reflexive on non-zero vectors: cosineSimilarity(a, a) === 1
 *   - Defined only when both inputs are non-empty and dimension-aligned;
 *     otherwise returns 0 (treated as "no information").
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Lightweight string similarity that requires no embedding model.
 *
 * - Normalizes: lowercases, collapses whitespace/punctuation, trims.
 * - Exact match after normalization: 1.0
 * - Containment (one contains the other): 0.95
 * - Otherwise: Jaccard coefficient over character 3-grams.
 */
export function contentSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[、。,.!?！？\s]+/g, ' ')
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.95;

  const trigrams = (s: string): Set<string> => {
    const out = new Set<string>();
    if (s.length < 3) {
      out.add(s);
      return out;
    }
    for (let i = 0; i <= s.length - 3; i++) out.add(s.slice(i, i + 3));
    return out;
  };
  const ta = trigrams(na);
  const tb = trigrams(nb);
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Hybrid similarity that uses cosine when both records carry a usable embedding
 * and falls back to content similarity otherwise.
 *
 * Note: the threshold semantics differ between the two metrics
 * (cosine 0.92 ≈ "same topic"; Jaccard 0.92 ≈ "92% of 3-grams shared").
 * Choose `cosineThreshold` and `contentThreshold` independently.
 */
export function buildHybridSimilarity<I extends { content: string }>(args: {
  getEmbedding: (item: I) => readonly number[] | null | undefined;
  cosineThreshold: number;
  contentThreshold: number;
}): {
  similarityOf: (a: I, b: I) => number;
  /** Tells callers which threshold to compare `sim` against. */
  isEquivalent: (a: I, b: I, sim: number) => boolean;
} {
  const { getEmbedding, cosineThreshold, contentThreshold } = args;
  return {
    similarityOf: (a, b) => {
      const ea = getEmbedding(a);
      const eb = getEmbedding(b);
      if (ea && eb && ea.length > 0 && eb.length > 0 && ea.length === eb.length) {
        return cosineSimilarity(ea, eb);
      }
      return contentSimilarity(a.content, b.content);
    },
    isEquivalent: (a, b, sim) => {
      const ea = getEmbedding(a);
      const eb = getEmbedding(b);
      const usedCosine = !!(
        ea &&
        eb &&
        ea.length > 0 &&
        eb.length > 0 &&
        ea.length === eb.length
      );
      return sim >= (usedCosine ? cosineThreshold : contentThreshold);
    },
  };
}
