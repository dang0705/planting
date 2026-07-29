<template>
  <view>
    <view
      v-if="question.riskNotice || question.requiresExplicitConsent"
      :id="`diagnose-question-risk-notice-${questionId}`"
      class="mt-3 rounded-xl bg-[#fff6f3] px-3 py-2"
    >
      <text class="block text-[11px] font-semibold text-[#8b3a2f]">操作提醒</text>
      <text class="mt-1 block text-[11px] leading-relaxed text-[#8b3a2f]">
        {{ question.riskNotice || '不方便操作时可以跳过。' }}
      </text>
      <text v-if="safetyInstructionsText" class="mt-1 block text-[11px] text-[#8b3a2f]">
        {{ safetyInstructionsText }}
      </text>
      <view v-if="question.requiresExplicitConsent" class="mt-2 flex gap-2">
        <button
          :id="`diagnose-question-risk-consent-${questionId}`"
          class="h-[34px] flex-1 rounded-lg p-0 text-[11px] leading-[34px]"
          :class="
            hasQuestionRiskConsent(question) ? 'bg-[#2d7a4f] text-white' : 'bg-white text-[#8b3a2f]'
          "
          @click="confirmQuestionRisk(question)"
        >
          我愿意操作
        </button>
        <button
          :id="`diagnose-question-risk-skip-${questionId}`"
          class="h-[34px] flex-1 rounded-lg bg-white p-0 text-[11px] leading-[34px] text-[#8b3a2f]"
          @click="skipRiskQuestion"
        >
          不方便 / 跳过
        </button>
      </view>
    </view>

    <view
      :id="`diagnose-question-package-page-option-stack-${questionId}`"
      class="mt-4 flex flex-col gap-2.5"
    >
      <view
        v-for="(option, optionIndex) in options"
        :key="option.optionId || option.optionKey || option.text"
        :id="`diagnose-question-package-page-option-${questionId}-${option.optionId || option.optionKey || optionIndex}`"
        class="overflow-hidden rounded-2xl border border-emerald-100 bg-white"
        :class="[
          isSelected(option) ? 'border-[#2d7a4f] bg-emerald-50' : '',
          isQuestionRiskOptionBlocked(question, option) ? 'opacity-50' : ''
        ]"
        @click="selectOption(option)"
      >
        <view class="flex items-center justify-between gap-3 px-3.5 py-3">
          <text class="min-w-0 flex-1 text-[13px] font-bold leading-snug text-gray-700">
            {{ getOptionText(question, option) }}
          </text>
          <text
            class="shrink-0 rounded-full border border-current px-2 py-0.5 text-[10px] font-extrabold text-[#8b7355]"
          >
            {{ isSelected(option) ? '已选' : '单选' }}
          </text>
        </view>
        <text
          v-if="getOptionDescription(option)"
          class="block whitespace-pre-line px-3.5 pb-3 text-[11px] leading-relaxed text-gray-500"
        >
          {{ getOptionDescription(option) }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useDiagnoseQuestionRisk } from '@/components/diagnose-flow/question-risk.js'
import { getOptionDescription, getOptionText } from './question-display.js'

const props = defineProps({
  question: { type: Object, required: true },
  questionId: { type: String, required: true },
  options: { type: Array, default: () => [] },
  selectedOptionId: { type: String, default: '' }
})
const emit = defineEmits(['select', 'skip'])
const riskConsentByQuestionId = ref({})
const { hasQuestionRiskConsent, confirmQuestionRisk, isQuestionRiskOptionBlocked } =
  useDiagnoseQuestionRisk({
    riskConsentByQuestionId,
    getQuestionId: () => props.questionId
  })
const safetyInstructionsText = computed(() =>
  (Array.isArray(props.question?.safetyInstructions) ? props.question.safetyInstructions : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join('；')
)

function getOptionId(option = {}) {
  return String(option?.optionId || option?.optionKey || '').trim()
}
function isSelected(option = {}) {
  return getOptionId(option) === props.selectedOptionId
}
function selectOption(option = {}) {
  if (isQuestionRiskOptionBlocked(props.question, option)) {
    uni.showToast({ title: '请先确认愿意操作，或选择跳过', icon: 'none' })
    return
  }
  emit('select', option)
}
function skipRiskQuestion() {
  const unknownOption = props.options.find(option => getOptionId(option) === 'unknown')
  if (unknownOption) {
    emit('skip', unknownOption)
  }
}
</script>
