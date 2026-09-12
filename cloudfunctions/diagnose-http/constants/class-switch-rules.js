'use strict'

module.exports = {
  activeFollowupModes: ['full'],
  restrictedFollowupModes: ['limited'],
  runtimeFollowupModes: ['full', 'limited'],
  activeClassScoreFloor: 0.16,
  secondaryClassScoreFloor: 0.1,
  hardConditionActivationScoreFloor: 0.22,
  hardConditionStickyPreviousFloor: 0.14,
  maxSecondaryClasses: 3,
  groupRolePriorityBoost: {
    differentiate: 26,
    exclude: 18,
    context: 10,
    confirm: 2
  },
  classConditionTypes: {
    soft: 'soft',
    hard: 'hard',
    disabled: 'disabled'
  }
}
