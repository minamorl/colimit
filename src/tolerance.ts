/**
 * Tolerance colimits — colimits modulo a non-transitive "near enough" relation.
 *
 * Classical colimits assume a true equivalence relation, but in practice we often
 * have a tolerance relation R (e.g. `sim(a, b) ≥ θ`) that fails transitivity.
 * Then no genuine quotient set exists, but given a finite set of candidate pairs
 * we can compute a deterministic finite approximation:
 *
 *   1. Sort candidate pairs by similarity, descending.
 *   2. Walk greedily. For each unabsorbed pair, keep the higher-scoring side
 *      (filtered colimit's maximum operator) and absorb the other.
 *   3. Skip pairs whose endpoints are already absorbed (idempotency of the quotient map).
 *
 * This is the right shape for deduplication against ANN-precomputed candidate pairs
 * (e.g. pgvector / FAISS results), or any "near-duplicate fold" where the equivalence
 * is only approximate.
 */

export type SimilarityPair<I> = {
  a: I;
  b: I;
  similarity: number;
};

export type ToleranceColimitResult<I> = {
  /** The kept representative. */
  kept: I;
  /** The element absorbed into the kept representative's class. */
  removed: I;
  similarity: number;
  /** Optional merged value produced by colimitOp (e.g. unified content). */
  merged?: string;
};

/**
 * Finite approximation of a colimit under a tolerance relation.
 *
 * Invariants:
 *   - Once an id is `removed`, it is never `kept` nor `removed` again (quotient idempotency).
 *   - `kept` always has the higher `importance` of the pair (filtered colimit's max).
 */
export function kanToleranceColimit<I extends { id: string; importance: number }>(args: {
  items: readonly I[];
  pairs: readonly SimilarityPair<I>[];
  colimitOp: (keep: I, remove: I, similarity: number) => string | undefined;
}): ToleranceColimitResult<I>[] {
  const sortedPairs = [...args.pairs].sort((p, q) => q.similarity - p.similarity);
  const absorbed = new Set<string>();
  const results: ToleranceColimitResult<I>[] = [];

  for (const pair of sortedPairs) {
    if (absorbed.has(pair.a.id) || absorbed.has(pair.b.id)) continue;

    const keep = pair.a.importance >= pair.b.importance ? pair.a : pair.b;
    const remove = keep === pair.a ? pair.b : pair.a;

    const merged = args.colimitOp(keep, remove, pair.similarity);
    results.push({ kept: keep, removed: remove, similarity: pair.similarity, merged });
    absorbed.add(remove.id);
  }

  return results;
}

export type DeduplicationResult<I> = {
  kept: I[];
  absorbed: Map<string, { keptId: string; similarity: number }>;
};

/**
 * High-level deduplication under a user-supplied tolerance relation.
 *
 * Computes all O(n^2) pairs above `threshold` internally — fine for the small
 * batches you typically pass through a working set (a few dozen items). For
 * larger sets, precompute candidate pairs with an ANN index and use
 * {@link kanDeduplicateByPairs} instead.
 *
 * @param items        Records (must carry an `id`).
 * @param similarityOf Pairwise similarity in [0, 1].
 * @param threshold    Pairs with similarity ≥ threshold are considered equivalent.
 * @param keepScoreOf  Score used to pick the representative (filtered colimit max).
 * @param onMerge      Optional side-effect hook for the kept/removed pair.
 */
export function kanDeduplicateByTolerance<I extends { id: string }>(args: {
  items: readonly I[];
  similarityOf: (a: I, b: I) => number;
  threshold: number;
  keepScoreOf: (item: I) => number;
  onMerge?: (keep: I, remove: I, similarity: number) => void;
}): DeduplicationResult<I> {
  const { items, similarityOf, threshold, keepScoreOf, onMerge } = args;

  if (items.length < 2) {
    return { kept: [...items], absorbed: new Map() };
  }

  const pairs: Array<{ a: I; b: I; similarity: number }> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a || !b) continue;
      const sim = similarityOf(a, b);
      if (sim >= threshold) {
        pairs.push({ a, b, similarity: sim });
      }
    }
  }
  pairs.sort((p, q) => q.similarity - p.similarity);

  const absorbed = new Map<string, { keptId: string; similarity: number }>();
  for (const pair of pairs) {
    if (absorbed.has(pair.a.id) || absorbed.has(pair.b.id)) continue;
    const aScore = keepScoreOf(pair.a);
    const bScore = keepScoreOf(pair.b);
    const keep = aScore >= bScore ? pair.a : pair.b;
    const remove = keep === pair.a ? pair.b : pair.a;
    absorbed.set(remove.id, { keptId: keep.id, similarity: pair.similarity });
    if (onMerge) onMerge(keep, remove, pair.similarity);
  }

  const kept = items.filter((item) => !absorbed.has(item.id));
  return { kept, absorbed };
}

/**
 * Pair-driven deduplication for cases where candidate pairs are precomputed
 * (e.g. by an ANN index over embeddings).
 *
 * Same colimit shape as {@link kanDeduplicateByTolerance}, but linear in the
 * size of the precomputed pair set rather than quadratic in `items`.
 *
 * Invariants:
 *   - Pairs whose ids are not in `items` are silently ignored (quotient map safety).
 *   - Once `removed`, an id is never revisited (idempotency).
 */
export function kanDeduplicateByPairs<I extends { id: string }>(args: {
  items: readonly I[];
  pairs: readonly { aId: string; bId: string; similarity: number }[];
  keepScoreOf: (item: I) => number;
}): DeduplicationResult<I> {
  const { items, pairs, keepScoreOf } = args;
  if (items.length < 2 || pairs.length === 0) {
    return { kept: [...items], absorbed: new Map() };
  }

  const byId = new Map<string, I>();
  for (const item of items) byId.set(item.id, item);

  const sortedPairs = [...pairs].sort((p, q) => q.similarity - p.similarity);
  const absorbed = new Map<string, { keptId: string; similarity: number }>();

  for (const pair of sortedPairs) {
    if (absorbed.has(pair.aId) || absorbed.has(pair.bId)) continue;
    const a = byId.get(pair.aId);
    const b = byId.get(pair.bId);
    if (!a || !b) continue;

    const aScore = keepScoreOf(a);
    const bScore = keepScoreOf(b);
    const keep = aScore >= bScore ? a : b;
    const remove = keep === a ? b : a;
    absorbed.set(remove.id, { keptId: keep.id, similarity: pair.similarity });
  }

  const kept = items.filter((item) => !absorbed.has(item.id));
  return { kept, absorbed };
}
