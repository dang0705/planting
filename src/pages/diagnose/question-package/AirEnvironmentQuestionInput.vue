<template>
  <view class="mt-4 rounded-2xl bg-[#f8faf9] p-3">
    <AirEnvironmentSummaryCard
      v-if="showSummary"
      :id="`diagnose-air-environment-${questionId}-summary`"
      :edit-button-id="`diagnose-air-environment-${questionId}-edit`"
      :confirm-button-id="`diagnose-air-environment-${questionId}-confirm-location`"
      :summary="summary"
      :needs-confirmation="needsConfirmation"
      @edit="emit('edit')"
      @confirm="emit('confirm')"
    />
    <view
      v-if="needsConfirmation && editorOpen"
      :id="`diagnose-air-environment-${questionId}-location-confirmation`"
      class="mb-3 rounded-xl bg-[#fff7ed] px-3 py-2"
    >
      <text class="block text-xs leading-5 text-[#9a5a14]">
        植物位置可能已变化，已带入旧资料；请确认或修改后再继续。
      </text>
      <button
        :id="`diagnose-air-environment-${questionId}-confirm-location`"
        class="mt-2 h-8 rounded-lg border border-[#b86d1b] bg-white px-3 text-xs font-semibold leading-8 text-[#9a5a14]"
        @click="emit('confirm')"
      >
        确认当前位置未变
      </button>
    </view>
    <AirEnvironmentAssessment
      v-if="!showSummary || editorOpen"
      :id-prefix="`diagnose-air-environment-${questionId}`"
      layout-mode="single-page"
      height-mode="content"
      :model-value="modelValue"
      :footer-position="footerPosition"
      :back-label="backLabel"
      :back-id="backId"
      :completion-label="completionLabel"
      :completion-id="completionId"
      @change="value => emit('change', value)"
      @back="emit('back')"
      @complete="value => emit('complete', value)"
    />
    <button
      :id="`diagnose-air-environment-${questionId}-unknown`"
      class="mt-4 h-10 w-full rounded-xl border border-[#b8c9be] bg-white p-0 text-sm font-semibold leading-10 text-[#466054]"
      @click="emit('unknown')"
    >
      不确定，跳过这项
    </button>
  </view>
</template>

<script setup>
import AirEnvironmentAssessment from '@/components/AirEnvironmentAssessment.vue'
import AirEnvironmentSummaryCard from '@/components/AirEnvironmentSummaryCard.vue'

defineProps({
  questionId: { type: String, default: '' },
  modelValue: { type: Object, default: null },
  footerPosition: { type: String, default: 'absolute' },
  showSummary: { type: Boolean, default: false },
  editorOpen: { type: Boolean, default: false },
  needsConfirmation: { type: Boolean, default: false },
  summary: { type: String, default: '' },
  backLabel: { type: String, default: '' },
  backId: { type: String, default: '' },
  completionLabel: { type: String, default: '' },
  completionId: { type: String, default: '' }
})
const emit = defineEmits(['change', 'unknown', 'edit', 'confirm', 'back', 'complete'])
</script>
