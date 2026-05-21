# Changelog

## 0.1.0 — 2026-05-21

Initial release.

### Added

- `kanExtend` — generalized pointwise left Kan extension with pluggable
  `colimitOp`.
- `kanMergeStrings` — G-Set CRDT (trim-normalized union).
- `kanMergeHistory` — LWW-Register CRDT keyed by `${table}:${action}:${appliedAt}`.
- `kanColimitWeighted` — weighted colimit on a discrete category; collisions
  fold by `Math.max(importance)`.
- `kanToleranceColimit` — colimit under a tolerance relation, given precomputed
  similarity pairs.
- `kanDeduplicateByTolerance` — O(n²) deduplication driven by a user-supplied
  similarity function.
- `kanDeduplicateByPairs` — pair-driven deduplication for ANN-precomputed
  candidate sets.
- `cosineSimilarity`, `contentSimilarity`, `buildHybridSimilarity` —
  similarity primitives intended to be plugged into the tolerance APIs.
