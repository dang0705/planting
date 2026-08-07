<template>
  <AirEnvironmentQuestionInput
    :question-id="questionId"
    :model-value="airEnvironment.getByQuestion(question)"
    :show-summary="airEnvironment.isSummaryVisible(question)"
    :editor-open="airEnvironment.isEditorOpen(question)"
    :needs-confirmation="airEnvironment.needsConfirmation(question)"
    :summary="airEnvironment.getSummary(question)"
    :footer-position="footerPosition"
    :back-label="backLabel"
    :back-id="backId"
    :completion-label="completionLabel"
    :completion-id="completionId"
    @change="value => $emit('change', value)"
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
  airEnvironment: { type: Object, required: true },
  footerPosition: { type: String, default: 'absolute' },
  backLabel: { type: String, default: '' },
  backId: { type: String, default: '' },
  completionLabel: { type: String, default: '' },
  completionId: { type: String, default: '' }
})
defineEmits(['change', 'unknown', 'edit', 'confirm', 'back', 'complete'])
</script>
