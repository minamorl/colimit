# Changelog

## 0.2.0 (2026-05-21)

### BREAKING CHANGES — full API redesign.

The v0.1 surface was theory-first and required users to construct comma slices
and indexers by hand. v0.2 is a complete reset around a single mental model:
typed `groupBy` + `fold` with a plug-replaceable merger.

#### Removed

- `kanExtend`, `kanMergeStrings`, `kanMergeHistory`, `kanColimitWeighted`
- `kanToleranceColimit`, `kanDeduplicateByTolerance`, `kanDeduplicateByPairs`
- top-level `cosineSimilarity`, `contentSimilarity`, `buildHybridSimilarity`

#### Added

Core (2):
- `colimit({ items, by, merge })` — typed groupBy-fold
- `tolerance({ items, similar, merge })` — colimit under non-transitive equivalence

Mergers (6, all semilattice-safe):
- `gset`, `lww`, `maxBy`, `minBy`, `pnCounter` (+ `pnCounterValue`), `mergeFields`

Similarity (`sim` namespace, 7):
- `sim.cosine`, `sim.cosineAbove`
- `sim.jaccard`, `sim.jaccardWords`, `sim.jaccardWordsAbove`
- `sim.weighted`, `sim.above`

#### Migration

```ts
// v0.1
import { kanMergeStrings, kanColimitWeighted } from "@minamorl/colimit";
kanMergeStrings(existing, incoming);
kanColimitWeighted(items, getKey, getImportance);

// v0.2
import { colimit, gset, maxBy } from "@minamorl/colimit";
colimit({
  items: [...existing, ...incoming],
  by: (s) => s.trim(),
  merge: (a, _b) => a,
});
colimit({ items, by: getKey, merge: maxBy(getImportance) });
```

## 0.1.0 (2026-05-21)

Initial release. Theory-first API around `kanExtend` with helpers
`kanMergeStrings`, `kanMergeHistory`, `kanColimitWeighted`,
`kanToleranceColimit`, plus a similarity module. Superseded by 0.2.0.
