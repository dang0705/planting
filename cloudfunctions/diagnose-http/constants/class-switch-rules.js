'use strict'

module.exports = {
  activeFollowupModes: ['full'],
  restrictedFollowupModes: ['limited'],
  runtimeFollowupModes: ['full', 'limited'],
  activeClassScoreFloor: 0.16,
  secondaryClassScoreFloor: 0.1,
  hardGateActivationScoreFloor: 0.22,
  hardGateStickyPreviousFloor: 0.14,
  maxSecondaryClasses: 3,
  groupRolePriorityBoost: {
    differentiate: 26,
    exclude: 18,
    context: 10,
    confirm: 2
  },
  classGateTypes: {
    soft: 'soft',
    hard: 'hard',
    disabled: 'disabled'
  }
}
