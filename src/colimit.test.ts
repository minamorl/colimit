import { describe, expect, it } from "vitest";
import { colimit, tolerance } from "./colimit.js";
import { gset, lww, maxBy, mergeFields, pnCounter, pnCounterValue } from "./merger.js";
import { sim } from "./index.js";

describe("colimit", () => {
  it("folds items by key with a merger", () => {
    const events = [
      { user: "a", count: 1 },
      { user: "b", count: 2 },
      { user: "a", count: 5 },
      { user: "a", count: 3 },
    ];
    const out = colimit({
      items: events,
      by: (e) => e.user,
      merge: maxBy((e) => e.count),
    });
    expect(out).toEqual([
      { user: "a", count: 5 },
      { user: "b", count: 2 },
    ]);
  });

  it("preserves first-seen order of equivalence classes", () => {
    const out = colimit({
      items: [{ k: "z" }, { k: "a" }, { k: "z" }, { k: "m" }],
      by: (x) => x.k,
      merge: (a, _b) => a,
    });
    expect(out.map((x) => x.k)).toEqual(["z", "a", "m"]);
  });

  it("works on empty input", () => {
    const out = colimit<{ k: string }, string>({
      items: [],
      by: (x) => x.k,
      merge: (a) => a,
    });
    expect(out).toEqual([]);
  });

  it("works with LWW by timestamp", () => {
    const rows = [
      { id: 1, value: "old", ts: 100 },
      { id: 1, value: "new", ts: 200 },
      { id: 2, value: "stay", ts: 50 },
    ];
    const out = colimit({
      items: rows,
      by: (r) => r.id,
      merge: lww((r) => r.ts),
    });
    expect(out).toEqual([
      { id: 1, value: "new", ts: 200 },
      { id: 2, value: "stay", ts: 50 },
    ]);
  });

  it("works with mergeFields for per-field policies", () => {
    type User = { id: string; score: number; tags: string[]; updatedAt: number };
    const items: User[] = [
      { id: "u1", score: 10, tags: ["a", "b"], updatedAt: 100 },
      { id: "u1", score: 30, tags: ["b", "c"], updatedAt: 50 },
    ];
    const out = colimit({
      items,
      by: (u) => u.id,
      merge: mergeFields<User>({
        score: (a, b) => Math.max(a, b),
        tags: (a, b) => [...new Set([...a, ...b])],
        updatedAt: (a, b) => Math.max(a, b),
      }),
    });
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(30);
    expect(out[0].updatedAt).toBe(100);
    expect(new Set(out[0].tags)).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("mergers (semilattice laws)", () => {
  it("maxBy is idempotent and commutative", () => {
    const m = maxBy((x: { v: number }) => x.v);
    const a = { v: 5 };
    const b = { v: 7 };
    expect(m(a, a)).toEqual(a);
    expect(m(a, b)).toEqual(m(b, a));
  });

  it("gset deduplicates by key", () => {
    const m = gset((x: { id: string }) => x.id);
    const out = m(
      [{ id: "a" }, { id: "b" }],
      [{ id: "b" }, { id: "c" }],
    );
    expect(out.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("pnCounter takes elementwise max and computes value", () => {
    const a = { p: 3, n: 1 };
    const b = { p: 5, n: 2 };
    const merged = pnCounter(a, b);
    expect(merged).toEqual({ p: 5, n: 2 });
    expect(pnCounterValue(merged)).toBe(3);
  });

  it("lww handles Date values", () => {
    const m = lww<{ v: string; at: Date }>((r) => r.at);
    const a = { v: "old", at: new Date("2024-01-01") };
    const b = { v: "new", at: new Date("2024-06-01") };
    expect(m(a, b).v).toBe("new");
    expect(m(b, a).v).toBe("new");
  });
});

describe("tolerance", () => {
  it("collapses connected components under a similarity predicate", () => {
    // a ~ b ~ c (chain), d alone
    const items = ["a", "b", "c", "d"];
    const adjacency: Record<string, string[]> = {
      a: ["b"],
      b: ["a", "c"],
      c: ["b"],
      d: [],
    };
    const out = tolerance({
      items,
      similar: (x, y) => adjacency[x]?.includes(y) ?? false,
      merge: (a, _b) => a, // keep first
    });
    expect(out.sort()).toEqual(["a", "d"]);
  });

  it("works with jaccard similarity for strings", () => {
    const items = [
      "the quick brown fox",
      "quick brown fox jumps",
      "a totally unrelated phrase",
    ];
    const out = tolerance({
      items,
      similar: sim.jaccardWordsAbove(0.3),
      merge: (a, _b) => a,
    });
    expect(out).toHaveLength(2);
  });

  it("returns empty on empty input", () => {
    const out = tolerance<string>({
      items: [],
      similar: () => true,
      merge: (a) => a,
    });
    expect(out).toEqual([]);
  });
});

describe("sim", () => {
  it("cosine of identical vectors is 1", () => {
    expect(sim.cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("cosine of orthogonal vectors is 0", () => {
    expect(sim.cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("cosine of zero vector is 0 (no NaN)", () => {
    expect(sim.cosine([0, 0], [1, 1])).toBe(0);
  });

  it("jaccard of equal sets is 1", () => {
    expect(sim.jaccard([1, 2, 3], [3, 2, 1])).toBe(1);
  });

  it("jaccard of disjoint sets is 0", () => {
    expect(sim.jaccard([1, 2], [3, 4])).toBe(0);
  });

  it("weighted combines multiple similarity scores", () => {
    type X = { v: number[]; s: string };
    const score = sim.weighted<X>([
      { weight: 0.7, score: (a, b) => sim.cosine(a.v, b.v) },
      { weight: 0.3, score: (a, b) => sim.jaccardWords(a.s, b.s) },
    ]);
    const a: X = { v: [1, 0], s: "hello world" };
    const b: X = { v: [1, 0], s: "hello world" };
    expect(score(a, b)).toBeCloseTo(1);
  });
});
