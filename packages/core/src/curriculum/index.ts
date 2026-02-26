export {
  loadJapaneseReferenceCorpus,
  getReferenceItemsByLevel,
  getReferenceItemsByFrequencyRange,
  getAssessmentCandidates,
  getItemBySurfaceForm,
  getItemByPatternId,
  getItemsForLevel,
  getItemsAtOrBelowLevel,
  getItemsBelowLevel,
  getCollocationsByLevel,
  getChunksByLevel,
  getPragmaticFormulasByLevel,
  getSenseGroup,
  getCollocationById,
  getChunkById,
  getPragmaticFormulaById,
  type ReferenceVocabItem,
  type ReferenceGrammarItem,
  type ReferenceCollocation,
  type ReferenceChunk,
  type ReferencePragmaticFormula,
  type ReferenceCorpus,
} from './reference-data'

export {
  computeKnowledgeBubble,
  identifyGaps,
  type BubbleItemInput,
} from './bubble'

export {
  generateRecommendations,
  checkPrerequisites,
  type RecommendationInput,
} from './recommender'

export {
  generateCurriculumPlan,
  type CurriculumPlan,
  type PlannerInput,
} from './planner'

export {
  loadCurriculumSpine,
  getUnitById,
  getNextUnit,
  getUnitForItem,
  getUnitProgress,
  evaluateChunkTriggers,
  getSpineBoosts,
} from './spine-loader'
