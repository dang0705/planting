<template>
  <view
    v-if="result"
    id="diagnose-question-package-result-shell"
    class="box-border min-h-full bg-[#f8faf9] pb-6 pt-5"
  >
    <view id="diagnose-question-package-result-card" class="rounded-2xl bg-[#2d7a4f] px-5 py-5">
      <text class="block text-[14px] font-normal leading-5 text-white/80">
        {{ plantName }} · 诊断结果
      </text>
      <text
        id="diagnose-question-package-result-outcomes"
        class="mt-2 block text-[30px] font-bold leading-[38px] text-white"
      >
        {{ outcomeDisplayTitle }}
      </text>
      <view v-if="secondaryOutcomeDisplays.length" class="mt-3 flex flex-wrap gap-2">
        <text
          v-for="(item, index) in secondaryOutcomeDisplays"
          :key="`secondary_outcome_${index}`"
          data-diagnosis-outcome-label="true"
          class="rounded-full bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-white"
        >
          {{ item }}
        </text>
      </view>
      <view class="mt-4 flex self-start rounded-full bg-white/15 px-3 py-1.5">
        <text class="text-[12px] font-semibold leading-4 text-white">
          可信度：{{ confidenceText }}
        </text>
      </view>
    </view>

    <slot name="after-conclusion" />

    <view
      v-if="observedDisplayItems.length || visualMissingInfoForPath.length"
      id="diagnose-question-package-result-observed"
      class="mt-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white px-5 py-4"
    >
      <text class="block text-[14px] font-normal leading-5 text-[#5a7a68]">照片中看到</text>
      <view v-if="observedDisplayItems.length" class="mt-3 flex flex-wrap gap-2">
        <text
          v-for="item in observedDisplayItems"
          :key="item.key"
          class="rounded-full bg-[#eaf8f1] px-2.5 py-1.5 text-[11px] font-semibold leading-none text-[#2d6a4f]"
        >
          {{ item.label
          }}<text v-if="item.supportImageCount > 1" class="font-normal">
            · {{ item.supportImageCount }} 张</text
          >
        </text>
      </view>
      <view v-if="visualMissingInfoForPath.length" class="mt-3 rounded-xl bg-[#f8f6f0] px-3 py-2.5">
        <text class="block text-[11px] font-semibold text-[#8b7355]">还需要核实</text>
        <text
          v-for="item in visualMissingInfoForPath"
          :key="`${item.dimensionKey}-${item.reasonCn}`"
          class="mt-1 block text-[11px] leading-relaxed text-gray-600"
        >
          {{ item.reasonCn }}
        </text>
      </view>
    </view>

    <view
      id="diagnose-question-package-result-action-advice"
      class="mt-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white px-5 py-4"
    >
      <view class="flex items-center gap-1.5">
        <image :src="adviceIcon" class="size-3.5" mode="aspectFit" />
        <text class="text-[14px] font-normal leading-5 text-[#5a7a68]">建议先这样做</text>
      </view>
      <view v-if="actionAdviceGroups.length" class="mt-3 flex flex-col">
        <view
          v-for="group in actionAdviceGroups"
          :key="`action_group_${group.key}`"
          data-advice-section="action"
          class="mb-3 last:mb-0"
        >
          <text
            v-if="group.showOutcomeLabel"
            class="block text-[12px] font-semibold leading-5 text-[#5a7a68]"
          >
            {{ group.displayLabel || group.symptomLabel || group.outcomeLabel }}
          </text>
          <view
            v-for="(item, index) in group.items"
            :key="`action_group_${group.key}_${index}`"
            class="flex items-start gap-3"
            :class="index === 0 ? 'mt-2' : 'mt-3'"
          >
            <view
              class="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#eaf8f1]"
            >
              <text class="text-[11px] font-semibold leading-5 text-[#2d7a4f]">{{
                index + 1
              }}</text>
            </view>
            <text class="flex-1 whitespace-pre-line text-[14px] leading-[22px] text-[#0a0a0a]">
              {{ item }}
            </text>
          </view>
        </view>
      </view>
      <view v-else-if="actionAdviceTexts.length" class="mt-3 flex flex-col">
        <view
          v-for="(item, index) in actionAdviceTexts"
          :key="`action_text_${index}`"
          class="flex items-start gap-3"
          :class="index === 0 ? 'mt-2' : 'mt-3'"
        >
          <view class="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#eaf8f1]">
            <text class="text-[11px] font-semibold leading-5 text-[#2d7a4f]">{{ index + 1 }}</text>
          </view>
          <text class="flex-1 whitespace-pre-line text-[14px] leading-[22px] text-[#0a0a0a]">
            {{ item }}
          </text>
        </view>
      </view>
      <view v-else class="mt-3 flex items-start gap-3">
        <view class="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#eaf8f1]">
          <text class="text-[11px] font-semibold leading-5 text-[#2d7a4f]">1</text>
        </view>
        <text class="flex-1 text-[14px] leading-[22px] text-[#0a0a0a]">
          暂时没有更具体的行动建议，建议先保持观察并避免过度处理。
        </text>
      </view>
    </view>

    <view
      v-if="avoidAdviceGroups.length || avoidAdviceTexts.length"
      id="diagnose-question-package-result-avoid-advice"
      class="mt-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white px-5 py-4"
    >
      <view class="flex items-center gap-1.5">
        <image :src="avoidIcon" class="size-3.5" mode="aspectFit" />
        <text class="text-[14px] font-normal leading-5 text-[#5a7a68]">暂时避免</text>
      </view>
      <view v-if="avoidAdviceGroups.length" class="mt-3 flex flex-col">
        <view
          v-for="group in avoidAdviceGroups"
          :key="`avoid_group_${group.key}`"
          data-advice-section="avoid"
          class="mb-3 last:mb-0"
        >
          <text
            v-if="group.showOutcomeLabel"
            class="block text-[12px] font-semibold leading-5 text-[#5a7a68]"
          >
            {{ group.displayLabel || group.symptomLabel || group.outcomeLabel }}
          </text>
          <view
            v-for="(item, index) in group.items"
            :key="`avoid_group_${group.key}_${index}`"
            class="flex items-start gap-3"
            :class="index === 0 ? 'mt-2' : 'mt-3'"
          >
            <view
              class="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#fff0f0]"
            >
              <text class="text-[11px] font-semibold leading-5 text-[#d32f2f]">{{
                index + 1
              }}</text>
            </view>
            <text class="flex-1 whitespace-pre-line text-[14px] leading-[22px] text-[#0a0a0a]">
              {{ item }}
            </text>
          </view>
        </view>
      </view>
      <view v-else class="mt-3 flex flex-col">
        <view
          v-for="(item, index) in avoidAdviceTexts"
          :key="`avoid_text_${index}`"
          class="flex items-start gap-3"
          :class="index === 0 ? 'mt-2' : 'mt-3'"
        >
          <view class="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#fff0f0]">
            <text class="text-[11px] font-semibold leading-5 text-[#d32f2f]">{{ index + 1 }}</text>
          </view>
          <text class="flex-1 whitespace-pre-line text-[14px] leading-[22px] text-[#0a0a0a]">
            {{ item }}
          </text>
        </view>
      </view>
    </view>

    <slot name="after-avoid" />

    <DiagnosisFeedbackCard
      :result-id="feedbackResultId"
      id-prefix="diagnose-question-package-result-feedback"
    />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import avoidIcon from '@/assets/diagnosis/outcome-avoid.svg'
import adviceIcon from '@/assets/diagnosis/diagnosis-leaf.svg'
import DiagnosisFeedbackCard from '../components/DiagnosisFeedbackCard.vue'
import { normalizeDisplayEvidenceItem, useQuestionPackageResultView } from './result-view.js'

const props = defineProps({
  result: { type: Object, default: null },
  payload: { type: Object, default: () => ({}) },
  feedbackResultId: { type: [String, Number], default: '' }
})

const resultRef = computed(() => props.result)
const payloadRef = computed(() => props.payload || {})
const {
  outcomeDisplayTitle,
  allOutcomeDisplays,
  observedItems,
  actionAdviceGroups,
  actionAdviceTexts,
  avoidAdviceGroups,
  avoidAdviceTexts
} = useQuestionPackageResultView({ result: resultRef, payload: payloadRef })

const plantName = computed(() =>
  String(
    resultRef.value?.plantName ||
      payloadRef.value?.plantName ||
      payloadRef.value?.plant?.displayName ||
      '植物'
  ).trim()
)

const confidenceText = computed(() => {
  const value = String(
    resultRef.value?.confidenceLevel || resultRef.value?.finalResult?.confidenceLevel || ''
  )
    .trim()
    .toLowerCase()
  return (
    {
      high: '高',
      likely: '高',
      medium: '中等',
      normal: '中等',
      low: '较低'
    }[value] || '中等'
  )
})

const secondaryOutcomeDisplays = computed(() =>
  allOutcomeDisplays.value.filter(item => item && item !== outcomeDisplayTitle.value)
)

const visualEvidenceItems = computed(() => {
  const items = resultRef.value?.visualAggregateSummary?.visualEvidenceItems
  return Array.isArray(items) ? items : []
})

const visualMissingInfoForPath = computed(() => {
  const items = resultRef.value?.visualAggregateSummary?.visualMissingInfoForPath
  return Array.isArray(items) ? items : []
})

const observedDisplayItems = computed(() => {
  const seen = new Set()
  return [
    ...visualEvidenceItems.value.map((item, index) =>
      normalizeDisplayEvidenceItem(item, index, 'visual')
    ),
    ...observedItems.value
  ]
    .filter(Boolean)
    .filter(item => {
      if (seen.has(item.key)) {
        return false
      }
      seen.add(item.key)
      return true
    })
})

const feedbackResultId = computed(() =>
  String(
    props.feedbackResultId ||
      resultRef.value?.resultId ||
      resultRef.value?.diagnosisSessionId ||
      payloadRef.value?.diagnosisSessionId ||
      ''
  ).trim()
)
</script>
