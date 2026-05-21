/**
 * Mergers: associative + commutative + idempotent binary operations.
 *
 * A `Merger<T>` is a function `(a, b) => T` that should ideally satisfy:
 *   - associativity: merge(merge(a,b),c) == merge(a,merge(b,c))
 *   - commutativity: merge(a,b) == merge(b,a)
 *   - idempotence:   merge(a,a) == a
 *
 * Mergers satisfying all three form a join-semilattice. These are exactly
 * the convergent merge functions used in CRDTs (Shapiro et al., 2011).
 */

export type Merger<T> = (a: T, b: T) => T;

// ---------------------------------------------------------------------------
// Built-in mergers (CRDT-style)
// ---------------------------------------------------------------------------

/**
 * G-Set: grow-only set. `merge` is set union over an equivalence key.
 *
 * Returns a Merger over arrays. Items with the same `key` are deduplicated.
 * If `keep` is provided, it resolves duplicates (default: keep first seen).
 */
export function gset<T, K = T>(
  key: (x: T) => K = (x) => x as unknown as K,
  keep: Merger<T> = (a, _b) => a,
): Merger<readonly T[]> {
  return (a, b) => {
    const out = new Map<K, T>();
    for (const x of a) out.set(key(x), x);
    for (const x of b) {
      const k = key(x);
      const prev = out.get(k);
      out.set(k, prev === undefined ? x : keep(prev, x));
    }
    return [...out.values()];
  };
}

/**
 * Last-Writer-Wins by a comparable field (timestamp, version, etc.).
 *
 * `field` extracts a totally-ordered key; the larger one wins.
 * Ties are resolved by the second argument (idempotent on equal field).
 */
export function lww<T>(field: (x: T) => number | string | Date): Merger<T> {
  return (a, b) => {
    const fa = field(a);
    const fb = field(b);
    const va = fa instanceof Date ? fa.getTime() : fa;
    const vb = fb instanceof Date ? fb.getTime() : fb;
    if (vb > va) return b;
    if (va > vb) return a;
    return a;
  };
}

/** maxBy: keep the element with the greater numeric field. */
export function maxBy<T>(field: (x: T) => number): Merger<T> {
  return (a, b) => (field(b) > field(a) ? b : a);
}

/** minBy: keep the element with the smaller numeric field. */
export function minBy<T>(field: (x: T) => number): Merger<T> {
  return (a, b) => (field(b) < field(a) ? b : a);
}

/**
 * PN-Counter: positive-negative counter. State is `{ p: number, n: number }`;
 * `value = p - n`. Merging takes the elementwise max (G-Counter pattern).
 */
export interface PNCounterState {
  readonly p: number;
  readonly n: number;
}

export const pnCounter: Merger<PNCounterState> = (a, b) => ({
  p: Math.max(a.p, b.p),
  n: Math.max(a.n, b.n),
});

export const pnCounterValue = (s: PNCounterState): number => s.p - s.n;

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

/**
 * Build a per-field merger for a record type.
 *
 * `mergeFields({ score: maxBy(x => x), tags: gset() })` becomes
 * a `Merger<{ score, tags, ...rest }>` that merges per the spec and
 * keeps the right-hand side for any unspecified field.
 */
export function mergeFields<T extends object>(
  spec: { [K in keyof T]?: Merger<T[K]> },
): Merger<T> {
  return (a, b) => {
    const out: T = { ...b };
    for (const key of Object.keys(spec) as (keyof T)[]) {
      const m = spec[key];
      if (m) out[key] = m(a[key], b[key]);
    }
    return out;
  };
}
