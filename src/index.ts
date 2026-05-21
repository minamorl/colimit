/**
 * @minamorl/colimit
 *
 * Typed groupBy-fold with semilattice merge.
 *
 * Core: `colimit({ items, by, merge })` and `tolerance({ items, similar, merge })`.
 * Mergers: `gset`, `lww`, `maxBy`, `minBy`, `pnCounter`, `mergeFields`.
 * Similarity: `sim.cosine`, `sim.jaccard`, `sim.weighted`, ...
 */

export { colimit, tolerance } from "./colimit.js";
export type { ColimitOptions, ToleranceOptions } from "./colimit.js";

export {
  gset,
  lww,
  maxBy,
  minBy,
  pnCounter,
  pnCounterValue,
  mergeFields,
} from "./merger.js";
export type { Merger, PNCounterState } from "./merger.js";

import * as sim from "./sim.js";
export { sim };
