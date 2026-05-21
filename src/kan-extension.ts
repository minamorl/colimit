/**
 * Generalized left Kan extension and related colimit constructions.
 *
 * Given an indexing category I, source space M, and target space C,
 * with functors F: I -> M and G: I -> C, the left Kan extension Lan_F G: M -> C
 * is defined pointwise as
 *
 *     (Lan_F G)(m) = colim( (F ↓ m) -π-> I -G-> C )
 *
 * where (F ↓ m) is the comma category of objects with morphisms F(i) -> m,
 * and `colim` is the universal merger of their G-images in C.
 *
 * In everyday code this shows up whenever you classify items into
 * equivalence classes and fold collisions with some monotone operator
 * (set union, max, latest-wins, weighted sum, …). The shape is always the same;
 * only the choice of `colimitOp` changes.
 */

/**
 * Finite approximation of the comma category (F ↓ m).
 *
 * Mathematically (F ↓ m) has objects (i, f: F(i) -> m); in practice we
 * collapse it to "indices related to m, weighted by relationship strength".
 */
export type CommaSlice<I> = {
  /** Indices i ∈ I that map into m via F. */
  indices: I[];
  /**
   * Weight (≈ strength of the morphism F(i) -> m).
   * Larger weight contributes more to the universal cocone.
   */
  weights: Map<I, number>;
};

/**
 * Finite implementation of a pointwise left Kan extension.
 *
 * @param target    The object m ∈ M to extend at.
 * @param indexer   Computes (F ↓ m): which indices relate to `target`, and how strongly.
 * @param functorG  Lifts an index i ∈ I to the target space C.
 * @param colimitOp The colimit cocone in C: combines the target with the lifted contributions.
 * @returns `Lan_F G (m)` — the universal merge in C.
 *
 * `colimitOp` is the only piece you usually need to vary. Pick set union for G-Sets,
 * `Math.max` for LWW registers, vector averaging for embeddings, and so on.
 */
export function kanExtend<I, M, C>(args: {
  target: M;
  indexer: (target: M) => CommaSlice<I>;
  functorG: (index: I) => C;
  colimitOp: (target: M, contributions: Array<{ value: C; weight: number }>) => C;
}): C {
  const slice = args.indexer(args.target);
  const contributions = slice.indices.map((i) => ({
    value: args.functorG(i),
    weight: slice.weights.get(i) ?? 1,
  }));
  return args.colimitOp(args.target, contributions);
}

/**
 * Left Kan extension on the discrete category of strings (D_string).
 *
 * Equivalence is `trim()` equality; the colimit is the class representative.
 * Naively this is `new Set([...base, ...incoming])`, but writing it this way
 * makes the normalization and equivalence relation explicit.
 *
 * Order-theoretically this is exactly a **G-Set CRDT** (grow-only set):
 * commutative, associative, idempotent — a join-semilattice merge.
 */
export function kanMergeStrings(base: string[], incoming: string[]): string[] {
  const equivalenceClass = (s: string): string => s.trim();
  const classes = new Set<string>();

  for (const b of base) {
    if (typeof b === 'string' && b.trim().length > 0) {
      classes.add(equivalenceClass(b));
    }
  }
  for (const i of incoming) {
    if (typeof i !== 'string') continue;
    const cls = equivalenceClass(i);
    if (cls.length === 0) continue;
    classes.add(cls);
  }

  return Array.from(classes);
}

/**
 * Generic key-based latest-wins merge — the colimit on a totally ordered category.
 *
 * Entries that share the same key are collapsed to the one with the larger
 * `appliedAt` (lexicographic, so ISO8601 timestamps sort naturally as time).
 *
 * Corresponds to an **LWW-Register CRDT** keyed by `keyOf(entry)`.
 */
export type HistoryEntry = {
  table: string;
  ddl: string;
  appliedAt: string;
  action: 'create' | 'alter' | 'drop';
};

export function kanMergeHistory(
  base: readonly HistoryEntry[],
  incoming: readonly HistoryEntry[],
): HistoryEntry[] {
  const classMap = new Map<string, HistoryEntry>();
  const keyOf = (e: HistoryEntry): string => `${e.table}:${e.action}:${e.appliedAt}`;

  for (const entry of base) classMap.set(keyOf(entry), { ...entry });
  for (const entry of incoming) {
    if (!entry) continue;
    classMap.set(keyOf(entry), { ...entry });
  }

  return Array.from(classMap.values()).sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));
}

/**
 * Weighted colimit on a discrete category with an `importance` score.
 *
 * Equivalent records (same normalized content) are folded by taking the
 * `Math.max` of their importance — a filtered colimit that retains the
 * stronger morphism. Suitable as a stepping stone toward embedding-based
 * merges: keep this shape, swap the equivalence relation for cosine similarity.
 */
export type WeightedMemory = {
  /** Stable identifier. Required so callers can keep/remove records downstream. */
  id: string;
  content: string;
  importance: number;
};

export function kanColimitWeighted(
  base: readonly WeightedMemory[],
  incoming: readonly WeightedMemory[],
): WeightedMemory[] {
  const classMap = new Map<string, WeightedMemory>();
  const normalize = (s: string) => s.trim();

  for (const m of base) {
    const key = normalize(m.content);
    if (key.length === 0) continue;
    classMap.set(key, { id: m.id, content: key, importance: m.importance });
  }
  for (const m of incoming) {
    const key = normalize(m.content);
    if (key.length === 0) continue;
    const existing = classMap.get(key);
    if (existing) {
      classMap.set(key, {
        id: existing.importance >= m.importance ? existing.id : m.id,
        content: key,
        importance: Math.max(existing.importance, m.importance),
      });
    } else {
      classMap.set(key, { id: m.id, content: key, importance: m.importance });
    }
  }

  return Array.from(classMap.values()).sort((a, b) => b.importance - a.importance);
}
