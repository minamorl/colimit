/**
 * @minamorl/colimit
 *
 * A categorical merger library based on left Kan extensions.
 * Replace ad-hoc Set/Map merge logic with colimit-based equivalence-class folding.
 */

export {
  kanExtend,
  kanMergeStrings,
  kanMergeHistory,
  kanColimitWeighted,
  type CommaSlice,
  type HistoryEntry,
  type WeightedMemory,
} from './kan-extension.js';

export {
  kanToleranceColimit,
  kanDeduplicateByTolerance,
  kanDeduplicateByPairs,
  type SimilarityPair,
  type ToleranceColimitResult,
  type DeduplicationResult,
} from './tolerance.js';

export {
  cosineSimilarity,
  contentSimilarity,
  buildHybridSimilarity,
} from './similarity.js';
