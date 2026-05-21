# @minamorl/colimit

A categorical merger library based on left Kan extensions. Replace ad-hoc
`Set`/`Map` merge logic with **colimit-based equivalence-class folding**.

```ts
import { kanColimitWeighted } from '@minamorl/colimit';

const merged = kanColimitWeighted(
  [{ id: 'a', content: 'hello', importance: 5 }],
  [{ id: 'b', content: 'hello', importance: 10 }],
);
// → [{ id: 'b', content: 'hello', importance: 10 }]
//   same equivalence class collapsed; max-importance wins.
```

## Why

You write code like this every week:

```ts
const merged = [...existing, ...incoming].reduce((acc, item) => {
  const found = acc.find((x) => key(x) === key(item));
  if (found) {
    found.score = Math.max(found.score, item.score);
  } else {
    acc.push(item);
  }
  return acc;
}, [] as Item[]);
```

That's a **left Kan extension**. You classify by an equivalence relation,
then collapse collisions with a monotone operator. The mathematical name is
`(Lan_F G)(m) = colim((F ↓ m) → I → C)`; in practice it's "group by, then fold".

This library extracts the pattern. You provide:

- an **equivalence relation** (key, similarity threshold, …), and
- a **collapse operator** (union, max, latest-wins, weighted average, …).

The library handles the rest, with names that make the structure visible
when you come back to the code six months later.

## Install

```bash
pnpm add @minamorl/colimit
# or
npm i @minamorl/colimit
```

ESM-only. Requires TypeScript 5+ (uses `Bundler` module resolution).

## API

### Core

- **`kanExtend(opts)`** — the general left Kan extension. Take the comma slice
  `(F ↓ m)`, lift it through `G`, fold with `colimitOp`. The five other helpers
  below are just specializations.

### Discrete / total-order colimits (CRDT semantics)

- **`kanMergeStrings(base, incoming)`** — G-Set CRDT. Trim-normalized equivalence;
  union as the colimit.
- **`kanMergeHistory(base, incoming)`** — LWW-Register CRDT keyed by
  `${table}:${action}:${appliedAt}`. Latest content wins; sorted by timestamp.
- **`kanColimitWeighted(base, incoming)`** — weighted colimit on a discrete
  category. Same content → take `Math.max` of `importance`. Returns descending
  by importance.

### Tolerance colimits (non-transitive "near enough")

When the equivalence relation is approximate (cosine similarity ≥ θ, etc.),
no true quotient exists, but we can compute a deterministic finite approximation:

- **`kanToleranceColimit(opts)`** — given precomputed `SimilarityPair`s,
  greedily fold by descending similarity. Keeps the higher `importance` side.
- **`kanDeduplicateByTolerance(opts)`** — O(n²) pairwise pass; convenient when
  the input batch is small.
- **`kanDeduplicateByPairs(opts)`** — same shape, but the candidate pair set is
  precomputed externally (typical with an ANN index over embeddings).

### Similarity primitives

- **`cosineSimilarity(a, b)`** — symmetric, returns `0` for empty / mismatched /
  zero vectors.
- **`contentSimilarity(a, b)`** — lightweight string similarity with no
  embedding model. Normalization → exact match (`1.0`) → containment (`0.95`) →
  Jaccard over character 3-grams.
- **`buildHybridSimilarity(opts)`** — picks cosine when both records carry a
  usable embedding, falls back to content similarity otherwise. Threshold
  semantics differ between the two paths, so `cosineThreshold` and
  `contentThreshold` are independent.

## Where to use it

- **ETL / record reconciliation** — `kanColimitWeighted` over normalized
  business keys.
- **Event-sourced state folding** — `kanMergeHistory` for keyed last-writer-wins
  semantics.
- **Cache layer merges** — `kanExtend` with a custom `colimitOp` that combines
  `fetchedAt` (max), `hitCount` (sum), `value` (latest).
- **Near-duplicate detection** — `kanDeduplicateByTolerance` against
  `cosineSimilarity` or `contentSimilarity`.
- **CRDT-style replicated structures** — `kanMergeStrings` is literally G-Set;
  `kanMergeHistory` is literally LWW-Register. Both are commutative,
  associative, idempotent (join-semilattice merges).

## Mathematical notes

If you prefer the formal version:

- `kanExtend` is the pointwise formula for `Lan_F G: M → C`, with `(F ↓ m)`
  approximated by `CommaSlice<I>`.
- Discrete-category cases (`kanMergeStrings`, `kanMergeHistory`,
  `kanColimitWeighted`) collapse to set-like or map-like colimits.
- Tolerance colimits implement the **chase**-style greedy fold against a
  precomputed similarity relation; the quotient map's idempotency is preserved
  by the absorbed-set bookkeeping.

For background reading:

- Mac Lane, *Categories for the Working Mathematician*, ch. X (Kan extensions).
- Shiebler, *Kan Extensions in Data Science and Machine Learning*,
  [arXiv:2203.09018](https://arxiv.org/abs/2203.09018).
- Spivak, Wisnesky, *Categorical Query Language* (functorial data migration
  as Σ / Δ / Π adjunctions).
- Shapiro et al., *Conflict-free Replicated Data Types* (INRIA RR-7687) for the
  CRDT correspondence.

## License

MIT © minamorl
