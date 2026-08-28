<template>
  <view
    v-if="resultId"
    :id="`${idPrefix}-card`"
    class="mt-3.5 rounded-[22px] border border-[#e7e0d1] bg-white p-4 shadow-sm"
  >
    <text class="block text-[15px] font-black text-gray-900">这次诊断和养护建议对你有帮助吗？</text>
    <view class="mt-3 flex gap-2">
      <button
        :id="`${idPrefix}-helpful-yes`"
        class="h-10 flex-1 rounded-xl border text-xs font-semibold"
        :class="
          isHelpful === true
            ? 'border-[#2d7a4f] bg-emerald-50 text-[#2d7a4f]'
            : 'border-gray-200 bg-white text-gray-600'
        "
        @click="isHelpful = true"
      >
        有帮助
      </button>
      <button
        :id="`${idPrefix}-helpful-no`"
        class="h-10 flex-1 rounded-xl border text-xs font-semibold"
        :class="
          isHelpful === false
            ? 'border-[#b45309] bg-orange-50 text-[#b45309]'
            : 'border-gray-200 bg-white text-gray-600'
        "
        @click="isHelpful = false"
      >
        没帮助
      </button>
    </view>
    <text class="mt-4 block text-[13px] font-semibold text-gray-800">判断准确吗？</text>
    <view class="mt-2 flex gap-2">
      <button
        :id="`${idPrefix}-accurate-yes`"
        class="h-10 flex-1 rounded-xl border text-xs font-semibold"
        :class="
          isAccurate === true
            ? 'border-[#2d7a4f] bg-emerald-50 text-[#2d7a4f]'
            : 'border-gray-200 bg-white text-gray-600'
        "
        @click="isAccurate = true"
      >
        判断准确
      </button>
      <button
        :id="`${idPrefix}-accurate-no`"
        class="h-10 flex-1 rounded-xl border text-xs font-semibold"
        :class="
          isAccurate === false
            ? 'border-[#b45309] bg-orange-50 text-[#b45309]'
            : 'border-gray-200 bg-white text-gray-600'
        "
        @click="isAccurate = false"
      >
        不太准确
      </button>
    </view>
    <textarea
      :id="`${idPrefix}-note`"
      v-model="note"
      class="mt-3 box-border min-h-[72px] w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
      placeholder="可以补充一句原因（可选）"
      maxlength="200"
    />
    <button
      :id="`${idPrefix}-submit`"
      class="mt-3 h-10 w-full rounded-xl bg-[#2d7a4f] text-xs font-bold text-white"
      :class="{ 'opacity-50': !canSubmit || submitting || submitted }"
      :disabled="!canSubmit || submitting || submitted"
      @click="submit"
    >
      {{ submitted ? '已提交，感谢反馈' : submitting ? '提交中...' : '提交反馈' }}
    </button>
    <text
      v-if="statusMessage"
      class="mt-2 block text-center text-xs"
      :class="statusType === 'error' ? 'text-[#b45309]' : 'text-[#5a7868]'"
    >
      {{ statusMessage }}
    </text>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { submitDiagnosisFeedback } from '../api/diagnosis.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'

const props = defineProps({
  resultId: { type: [String, Number], default: '' },
  idPrefix: { type: String, default: 'diagnosis-feedback' }
})

const isHelpful = ref(null)
const isAccurate = ref(null)
const note = ref('')
const submitting = ref(false)
const submitted = ref(false)
const statusMessage = ref('')
const statusType = ref('success')
const canSubmit = computed(
  () => isHelpful.value !== null && isAccurate.value !== null && Boolean(props.resultId)
)

async function submit() {
  if (!canSubmit.value || submitting.value || submitted.value) {
    return
  }
  submitting.value = true
  statusMessage.value = ''
  statusType.value = 'success'
  try {
    await submitDiagnosisFeedback({
      resultId: String(props.resultId),
      feedback: {
        isHelpful: isHelpful.value,
        isAccurate: isAccurate.value,
        note: note.value.trim()
      }
    })
    reportAnalyticsEvent(ANALYTICS_EVENTS.DIAGNOSE_FEEDBACK_SUBMITTED)
    submitted.value = true
    statusMessage.value = '反馈已记录，之后会用于人工优化。'
  } catch (error) {
    statusType.value = 'error'
    statusMessage.value = error?.message || '提交失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}
</script>
