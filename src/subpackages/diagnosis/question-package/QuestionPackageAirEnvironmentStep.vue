<template>
  <AirEnvironmentQuestionInput
    :question-id="questionId"
    :profile="airEnvironment.profile.value"
    :draft-state="airEnvironment.getDraftState(question)"
    :dual-mode="dualMode"
    :show-summary="airEnvironment.isSummaryVisible(question)"
    :editor-open="airEnvironment.isEditorOpen(question)"
    :needs-confirmation="airEnvironment.needsConfirmation(question)"
    :summary="airEnvironment.getSummary(question)"
    :footer-position="footerPosition"
    :external-footer="externalFooter"
    :back-label="backLabel"
    :back-id="backId"
    :completion-label="completionLabel"
    :completion-id="completionId"
    @draft-change="value => $emit('draft-change', value)"
    @unknown="$emit('unknown')"
    @edit="$emit('edit')"
    @confirm="$emit('confirm')"
    @back="$emit('back')"
    @complete="value => $emit('complete', value)"
  />
</template>

<script setup>
import AirEnvironmentQuestionInput from './AirEnvironmentQuestionInput.vue'

defineProps({
  question: { type: Object, default: () => ({}) },
  questionId: { type: String, default: '' },
  dualMode: { type: Boolean, default: false },
  airEnvironment: {
    type: Object,
    default: () => ({
      getDraftState: () => null,
      isSummaryVisible: () => false,
      isEditorOpen: () => false,
      needsConfirmation: () => false,
      getSummary: () => ''
    })
  },
  footerPosition: { type: String, default: 'absolute' },
  externalFooter: { type: Boolean, default: false },
  backLabel: { type: String, default: '' },
  backId: { type: String, default: '' },
  completionLabel: { type: String, default: '' },
  completionId: { type: String, default: '' }
})
defineEmits(['draft-change', 'unknown', 'edit', 'confirm', 'back', 'complete'])
</script>
