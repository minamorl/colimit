/**
 * `sim`: built-in similarity functions for use with `tolerance()`.
 *
 * Each function returns a predicate `(a, b) => boolean` (with a threshold)
 * or a raw score `(a, b) => number` you can threshold yourself.
 */

// ---------- Vector similarity -----------------------------------------------

/** Cosine similarity in [-1, 1]; returns 0 for zero vectors. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Returns a predicate: true if cosine(a,b) >= threshold. */
export const cosineAbove =
  (threshold: number) =>
  (a: readonly number[], b: readonly number[]): boolean =>
    cosine(a, b) >= threshold;

// ---------- String / set similarity -----------------------------------------

/** Jaccard similarity of two sets in [0, 1]. */
export function jaccard<T>(a: Iterable<T>, b: Iterable<T>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Tokenize on whitespace + lowercase. */
const tokens = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);

/** Word-level Jaccard between two strings. */
export function jaccardWords(a: string, b: string): number {
  return jaccard(tokens(a), tokens(b));
}

/** Predicate: jaccardWords(a,b) >= threshold. */
export const jaccardWordsAbove =
  (threshold: number) =>
  (a: string, b: string): boolean =>
    jaccardWords(a, b) >= threshold;

// ---------- Combinators -----------------------------------------------------

/**
 * Weighted average of multiple [0,1]-valued similarity functions.
 * Use to combine e.g. embedding cosine with token overlap.
 */
export function weighted<T>(
  parts: ReadonlyArray<{ weight: number; score: (a: T, b: T) => number }>,
): (a: T, b: T) => number {
  const total = parts.reduce((s, p) => s + p.weight, 0);
  if (total === 0) return () => 0;
  return (a, b) => {
    let acc = 0;
    for (const p of parts) acc += p.weight * p.score(a, b);
    return acc / total;
  };
}

/** Build a tolerance predicate from a score function + threshold. */
export const above =
  <T>(threshold: number, score: (a: T, b: T) => number) =>
  (a: T, b: T): boolean =>
    score(a, b) >= threshold;
