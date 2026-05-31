export {
  appendCareBehaviorSidecar,
  buildCareBehaviorTimelineFromDateEvents,
  extractCareBehaviorSidecar,
  getCareBehaviorDateSet,
  getCareBehaviorDateWindow,
  hasMeaningfulCareBehaviorTimeline,
  normalizeCareBehaviorTimeline,
  extractCareBehaviorTimelineFromQuestion
} from './care-behavior-timeline/logic.js'
export {
  buildCareBehaviorDisplayWindow
} from './care-behavior-timeline/display-window.js'
export {
  isUncertainCareBehaviorOption,
  isCareBehaviorTimelineSentinelOption,
  isLegacyWateringTimelineQuestion,
  isCareBehaviorTimelineQuestion,
  isCareBehaviorWateringTimelineQuestion,
  getVisibleCareBehaviorOptions,
  resolveCareBehaviorTimelineAutoAnswerOptionId,
  resolveCareBehaviorTimelineAnswerOptionId,
  isCareBehaviorTimelineUnclearAnswer,
  isCareBehaviorTimelineSentinelAnswer,
  shouldIncludeCareBehaviorTimelineQuestion
} from './care-behavior-timeline/question-helpers.js'
