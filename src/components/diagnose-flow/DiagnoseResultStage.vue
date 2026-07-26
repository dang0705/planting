<template>
  <view v-if="result" id="diagnose-result-stage">
    <view id="diagnose-result-plant-card" class="bg-gray-50 rounded-xl p-3 mb-3">
      <view class="flex items-center mb-2">
        <text class="text-2xl mr-2">🌿</text>
        <view class="flex-1">
          <text class="block text-base font-semibold text-gray-900">{{ resultPlantNameText }}</text>
          <text class="block text-xs text-gray-500">{{ resultScientificNameText }}</text></view
        ></view
      >
      <view class="flex items-center justify-between p-2 bg-white rounded-lg">
        <text class="text-xs font-semibold text-gray-700">健康状态</text>
        <view :class="resultHealthClass">
          <text class="text-xs font-bold">{{ resultHealthStatusText }}</text></view
        ></view
      ></view
    >
    <view v-if="resultObservedSymptoms.length" id="diagnose-result-observed-symptoms" class="mb-3">
      <text class="block text-sm font-semibold text-gray-900 mb-2">观察到的症状</text>
      <view class="bg-gray-50 rounded-xl p-3 flex flex-wrap gap-2">
        <view
          v-for="item in resultObservedSymptoms"
          :key="item.symptomKey"
          class="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[11px]"
        >
          {{ item.symptomCn || '待确认症状' }}</view
        ></view
      ></view
    >
    <view
      v-if="allOutcomeDisplays.length || resultMainIssueText || resultSummaryText"
      id="diagnose-result-current-conclusion"
      class="mb-3"
    >
      <text class="block text-sm font-semibold text-gray-900 mb-2">诊断结论</text>
      <view class="bg-gray-50 rounded-xl p-3">
        <view v-if="allOutcomeDisplays.length" class="mb-2">
          <text
            v-for="(item, index) in allOutcomeDisplays"
            :key="`result_outcome_${index}`"
            class="block text-xs text-gray-800 font-semibold leading-relaxed mb-1 last:mb-0"
          >
            {{ item }}</text
          ></view
        >
        <text v-else class="block text-xs text-gray-800 mb-2">{{ resultMainIssueText }}</text>
        <text class="block text-xs text-gray-600 leading-relaxed whitespace-pre-line">{{
          resultSummaryText
        }}</text></view
      ></view
    >
    <view
      v-if="hasOverwateringOutcome"
      id="diagnose-result-root-rot-entry"
      class="mb-3 rounded-[10px] border border-dashed border-amber-300 bg-amber-50 px-3 py-2"
    >
      <view class="flex items-center justify-between">
        <view class="flex-1">
          <text class="block text-xs text-amber-800 font-semibold">怀疑根腐？</text>
          <text class="block text-[10px] text-amber-700 mt-0.5">
            持续浇水过多可能伤根，建议观察根部并考虑换土修根
          </text>
        </view>
        <text
          id="diagnose-result-root-rot-entry-button"
          class="text-[10px] text-amber-600 font-medium px-2 py-1 rounded bg-amber-100"
        >
          即将上线
        </text>
      </view>
    </view>
    <RetakeCard
      v-if="hasRetakeRequest"
      :retake-request="retakeRequest"
      :retake-countdown-text="retakeCountdownText"
      :retake-expired="retakeExpired"
      :has-active-retake-authorization="hasActiveRetakeAuthorization"
      :retake-authorization-state="result?.retakeAuthorizationState || null"
      @begin="beginRetakeAuthorization"
      @skip="skipRetakeRequest"
    />
    <DirectionChoiceCard
      v-if="hasDirectionChoices"
      :direction-choices="directionChoices"
      :recommended-direction="result?.recommendedDirection || ''"
      @choose="chooseDirection"
    />
    <view v-if="actionAdviceGroups.length" id="diagnose-result-action-advice" class="mb-3">
      <text class="block text-sm font-semibold text-gray-900 mb-2">处理建议</text>
      <view class="bg-[#F3FAF5] rounded-xl p-3">
        <view
          v-for="group in actionAdviceGroups"
          :key="`action_${group.key}`"
          class="mb-2 last:mb-0"
        >
          <text
            v-if="group.showOutcomeLabel"
            class="block text-[11px] text-gray-800 font-semibold mb-1"
            >{{ group.outcomeLabel }}：</text
          >
          <text
            v-for="(item, index) in group.items"
            :key="`action_${group.key}_${index}`"
            class="block text-xs text-gray-700 leading-relaxed mb-2 last:mb-0"
          >
            {{ index + 1 }}. {{ item }}</text
          ></view
        ></view
      ></view
    >
    <view v-if="avoidAdviceGroups.length" id="diagnose-result-avoid-advice" class="mb-3">
      <text class="block text-sm font-semibold text-gray-900 mb-2">暂时不要做</text>
      <view class="bg-[#FFF6F3] rounded-xl p-3">
        <view v-for="group in avoidAdviceGroups" :key="`avoid_${group.key}`" class="mb-2 last:mb-0">
          <text
            v-if="group.showOutcomeLabel"
            class="block text-[11px] text-gray-800 font-semibold mb-1"
            >{{ group.outcomeLabel }}：</text
          >
          <text
            v-for="(item, index) in group.items"
            :key="`avoid_${group.key}_${index}`"
            class="block text-xs text-gray-700 leading-relaxed mb-2 last:mb-0"
          >
            {{ index + 1 }}. {{ item }}</text
          ></view
        ></view
      ></view
    >
    <DiagnoseQuestionPackageSection :view="view" />
  </view>
</template>

<script>
import { exposeViewProp } from '@/utils/component-view-proxy.js'
import DirectionChoiceCard from './DirectionChoiceCard.vue'
import DiagnoseQuestionPackageSection from './DiagnoseQuestionPackageSection.vue'
import RetakeCard from './RetakeCard.vue'
import { DIAGNOSE_VIEW_DEFAULTS } from './view-defaults.js'

export default {
  components: { DirectionChoiceCard, DiagnoseQuestionPackageSection, RetakeCard },
  props: {
    view: { type: Object, required: true }
  },
  setup(props) {
    const exposed = exposeViewProp(props, DIAGNOSE_VIEW_DEFAULTS)
    Object.defineProperty(exposed, 'hasOverwateringOutcome', {
      enumerable: true,
      configurable: true,
      get() {
        const result = props.view?.result
        const outcomes = result?.visibleOutcomes || result?.allOutcomes || []
        return (
          Array.isArray(outcomes) &&
          outcomes.some(item =>
            ['overwatering', 'overwatering_root_pressure'].includes(
              item?.outcomeKey || item?.problemKey
            )
          )
        )
      }
    })
    return exposed
  }
}
</script>

<style scoped src="./style.css"></style>
