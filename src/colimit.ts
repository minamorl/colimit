/**
 * `colimit`: typed groupBy-fold.
 *
 * Categorical reading: this is the colimit of the diagram
 *   (F ↓ m) → I → C
 * where `by` is the indexing functor F and `merge` is the colimit operation
 * (an associative-commutative-idempotent fold = join-semilattice).
 *
 * Practical reading: like lodash `groupBy` + `mergeWith`, but
 *   - one pass
 *   - typed
 *   - merger is plug-replaceable (use any CRDT-style merger)
 *   - preserves first-seen order
 */

import type { Merger } from "./merger.js";

export interface ColimitOptions<T, K> {
  /** Items to merge. */
  readonly items: Iterable<T>;
  /** Equivalence key. Items with the same key are folded together. */
  readonly by: (item: T) => K;
  /** Pairwise merger applied left-to-right. */
  readonly merge: Merger<T>;
}

/**
 * Fold an iterable by an equivalence key.
 *
 * @returns array of representatives, one per equivalence class,
 *          in the order each class was first seen.
 */
export function colimit<T, K>(opts: ColimitOptions<T, K>): T[] {
  const { items, by, merge } = opts;
  const map = new Map<K, T>();
  const order: K[] = [];
  for (const item of items) {
    const k = by(item);
    const prev = map.get(k);
    if (prev === undefined) {
      map.set(k, item);
      order.push(k);
    } else {
      map.set(k, merge(prev, item));
    }
  }
  return order.map((k) => map.get(k) as T);
}

/**
 * `tolerance`: colimit under a non-transitive equivalence ("tolerance relation").
 *
 * When equivalence is given by a similarity predicate rather than a key,
 * the relation may fail transitivity (a~b, b~c, but not a~c). This collapses
 * connected components of the similarity graph using union-find.
 *
 * Tradeoff: O(n²) similarity checks. Suitable for n ≲ 10k items or as a
 * post-pass after a cheaper `colimit` blocking step.
 */
export interface ToleranceOptions<T> {
  readonly items: readonly T[];
  /** Pairwise similarity predicate. */
  readonly similar: (a: T, b: T) => boolean;
  /** Pairwise merger (same constraints as `colimit`). */
  readonly merge: Merger<T>;
}

export function tolerance<T>(opts: ToleranceOptions<T>): T[] {
  const { items, similar, merge } = opts;
  const n = items.length;
  if (n === 0) return [];

  // Union-find over indices.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (similar(items[i], items[j])) union(i, j);
    }
  }

  // Collect components in first-seen order; fold each.
  const componentRep = new Map<number, T>();
  const order: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const prev = componentRep.get(r);
    if (prev === undefined) {
      componentRep.set(r, items[i]);
      order.push(r);
    } else {
      componentRep.set(r, merge(prev, items[i]));
    }
  }
  return order.map((r) => componentRep.get(r) as T);
}
