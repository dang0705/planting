<template>
  <view
    v-if="resultId"
    :id="`${idPrefix}-card`"
    class="mt-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white px-5 py-4"
  >
    <text class="block text-[14px] font-normal leading-5 text-[#5a7a68]"
      >这次诊断对你有帮助吗？</text
    >
    <view class="mt-2 flex gap-2">
      <button
        :id="`${idPrefix}-helpful-yes`"
        class="flex h-[34px] items-center justify-center gap-1.5 rounded-full border px-3 py-0 text-[12px] font-normal after:border-0"
        :class="
          isHelpful === true
            ? 'border-[#2d7a4f] bg-[#eaf8f1] text-[#2d7a4f]'
            : 'border-[rgba(45,122,79,0.15)] bg-white text-[#5a7a68]'
        "
        @click="isHelpful = true"
      >
        <image :src="helpfulIcon" class="size-3.5" mode="aspectFit" />
        有帮助
      </button>
      <button
        :id="`${idPrefix}-helpful-no`"
        class="flex h-[34px] items-center justify-center gap-1.5 rounded-full border px-3 py-0 text-[12px] font-normal after:border-0"
        :class="
          isHelpful === false
            ? 'border-[#d32f2f] bg-[#fff0f0] text-[#d32f2f]'
            : 'border-[rgba(45,122,79,0.15)] bg-white text-[#5a7a68]'
        "
        @click="isHelpful = false"
      >
        <image :src="notHelpfulIcon" class="size-3.5" mode="aspectFit" />
        没帮助
      </button>
    </view>
    <text class="mt-4 block text-[14px] font-normal leading-5 text-[#5a7a68]">判断准确吗？</text>
    <view class="mt-2 flex gap-2">
      <button
        :id="`${idPrefix}-accurate-yes`"
        class="h-[34px] rounded-full border px-3 py-0 text-[12px] font-normal after:border-0"
        :class="
          isAccurate === true
            ? 'border-[#2d7a4f] bg-[#eaf8f1] text-[#2d7a4f]'
            : 'border-[rgba(45,122,79,0.15)] bg-white text-[#5a7a68]'
        "
        @click="isAccurate = true"
      >
        判断准确
      </button>
      <button
        :id="`${idPrefix}-accurate-no`"
        class="h-[34px] rounded-full border px-3 py-0 text-[12px] font-normal after:border-0"
        :class="
          isAccurate === false
            ? 'border-[#d32f2f] bg-[#fff0f0] text-[#d32f2f]'
            : 'border-[rgba(45,122,79,0.15)] bg-white text-[#5a7a68]'
        "
        @click="isAccurate = false"
      >
        不太准确
      </button>
    </view>
    <view v-if="isHelpful !== null && isAccurate !== null">
      <textarea
        :id="`${idPrefix}-note`"
        v-model="note"
        class="mt-3 box-border min-h-[72px] w-full rounded-xl border border-[rgba(45,122,79,0.15)] px-3 py-2 text-xs"
        placeholder="可以补充一句原因（可选）"
        maxlength="200"
      />
      <button
        :id="`${idPrefix}-submit`"
        class="mt-3 h-10 w-full rounded-xl bg-[#2d7a4f] py-0 text-xs font-bold leading-10 text-white after:border-0"
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
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import helpfulIcon from '@/assets/diagnosis/outcome-helpful.svg'
import notHelpfulIcon from '@/assets/diagnosis/outcome-not-helpful.svg'
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
  } catch {
    statusType.value = 'error'
    statusMessage.value = '提交失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}
</script>
