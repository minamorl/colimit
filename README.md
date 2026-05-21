# @minamorl/colimit

Typed `groupBy` + `fold` with semilattice merge.

```bash
pnpm add @minamorl/colimit
```

## The pitch

You write this constantly:

```ts
const out = new Map<string, User>();
for (const u of users) {
  const prev = out.get(u.email);
  out.set(u.email, prev ? { ...prev, score: Math.max(prev.score, u.score) } : u);
}
return [...out.values()];
```

It's `groupBy` + `mergeWith`, but lodash's `mergeWith` doesn't compose, doesn't
type cleanly, and silently breaks when your merger isn't associative.

`colimit` is the same operation made explicit:

```ts
import { colimit, maxBy } from "@minamorl/colimit";

const out = colimit({
  items: users,
  by: (u) => u.email,
  merge: maxBy((u) => u.score),
});
```

That's it. One pass. Typed. First-seen order preserved. The `merge` argument is
just a binary function — pick one of the built-ins or write your own.

## Two core functions

### `colimit({ items, by, merge })`

Fold items by an equivalence key.

```ts
import { colimit, lww, mergeFields, gset } from "@minamorl/colimit";

// Deduplicate events, keeping the latest by timestamp.
colimit({
  items: events,
  by: (e) => e.id,
  merge: lww((e) => e.ts),
});

// Per-field merge policies.
colimit({
  items: users,
  by: (u) => u.id,
  merge: mergeFields<User>({
    score: (a, b) => Math.max(a, b),
    tags:  (a, b) => [...new Set([...a, ...b])],
    updatedAt: (a, b) => Math.max(a, b),
  }),
});
```

### `tolerance({ items, similar, merge })`

Same idea, but the equivalence is given by a pairwise predicate (which may not
be transitive). Connected components of the similarity graph collapse together.

```ts
import { tolerance, sim } from "@minamorl/colimit";

// Near-duplicate clustering by embedding cosine similarity.
const clusters = tolerance({
  items: documents,
  similar: (a, b) => sim.cosine(a.embedding, b.embedding) >= 0.85,
  merge: (a, b) => a.score > b.score ? a : b,
});
```

`tolerance` is O(n²) in the number of items; use it for near-duplicate dedup
after a cheaper `colimit` blocking step, or for small batches (n ≲ 10k).

## Built-in mergers

All built-in mergers form a join-semilattice — they're associative,
commutative, and idempotent — which means the result doesn't depend on input
order and is safe to use as a CRDT merge function.

| Merger          | Pattern                            | CRDT analogue   |
|-----------------|------------------------------------|-----------------|
| `gset(key?)`    | union by equivalence key           | G-Set           |
| `lww(field)`    | larger timestamp/version wins      | LWW-Register    |
| `maxBy(field)`  | larger numeric field wins          | (max-semilattice) |
| `minBy(field)`  | smaller numeric field wins         | (min-semilattice) |
| `pnCounter`     | elementwise max of `{p, n}` state  | PN-Counter      |
| `mergeFields`   | combine per-field mergers          | (product of CRDTs) |

Custom merger? Just write `(a, b) => T`. To stay semilattice-safe, make it
associative, commutative, and idempotent.

## Built-in similarities (`sim` namespace)

For use with `tolerance({ similar, ... })`:

- `sim.cosine(a, b)` — cosine similarity for `number[]` vectors
- `sim.cosineAbove(threshold)` — predicate form
- `sim.jaccard(a, b)` — Jaccard similarity of two iterables
- `sim.jaccardWords(a, b)` — Jaccard over whitespace-tokenized strings
- `sim.jaccardWordsAbove(threshold)` — predicate form
- `sim.weighted([{ weight, score }, ...])` — weighted combination
- `sim.above(threshold, scoreFn)` — turn any score into a predicate

## Why a library

The same pattern shows up everywhere:

- ETL deduplication / row merging
- Event-sourcing fold over the event stream
- Cache-entry consolidation
- GraphQL `DataLoader`-style request batching
- `GROUP BY ... AGG` translated to in-memory code
- Reducer `UPSERT` cases in Redux/Zustand
- Near-duplicate document clustering

Without a shared vocabulary you write a slightly different `reduce(..., new Map())`
in each of them. `colimit` gives you one shape and forces the merger to be
explicit — which is exactly where bugs hide.

## Background (optional)

Mathematically, `colimit` computes the colimit of the diagram
`(F ↓ m) → I → C` in the discrete-category case (the left Kan extension when
`merge` is associative-commutative-idempotent). Mergers satisfying those three
laws form a join-semilattice, which is precisely the convergence condition for
state-based CRDTs (Shapiro et al., 2011, _Conflict-free Replicated Data Types_).

In other words: `colimit` is the in-process projection of CRDT merge onto a
single machine. The same merger can be reused unchanged in a distributed
setting where state replicas converge over the same semilattice.

Related work:

- ekmett/kan-extensions (Haskell) — theoretical-first
- Yjs / Automerge — data-type-first CRDT libraries for collaborative editing
- lodash `groupBy` + `mergeWith` — ad-hoc, untyped, no semilattice contract
- Spivak, _Categorical Query Language_ (CQL) — functorial data migration via Σ/Δ/Π

`colimit` sits in the lodash niche with the Yjs guarantees and the ekmett vocabulary.

## License

MIT.
