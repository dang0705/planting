'use strict'

module.exports = {
  yellowing: {
    symptom_key: 'leaf_yellowing',
    display_name_cn: '叶片发黄',
    normalized_organ: 'leaf',
    visibility_scope: 'organ',
    readiness_cap: 'ready',
    confidence_adjustment: 0
  },
  brown_spots: {
    symptom_key: 'brown_spots_halo',
    display_name_cn: '褐斑带黄晕',
    normalized_organ: 'leaf',
    visibility_scope: 'local',
    readiness_cap: 'cautious',
    confidence_adjustment: -0.12,
    normalization_note: 'hf_label_brown_spots_mapped_to_brown_spots_halo'
  },
  bacterium: {
    normalized_organ: 'leaf',
    route_only_signal: true,
    min_route_score: 0.7,
    route_hint_type: 'unsupported_explanatory_label',
    route_hint_reason: 'hf_label_bacterium_requires_visual_or_followup_confirmation',
    normalization_note: 'hf_label_bacterium_not_written_to_evidence'
  },
  healthy: {
    normalized_organ: 'leaf',
    non_problematic_signal: true,
    route_hint_type: 'possible_non_problematic_signal',
    route_hint_reason: 'hf_label_healthy_requires_non_problematic_whitelist',
    normalization_note: 'hf_label_healthy_not_written_to_evidence'
  }
}
