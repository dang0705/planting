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
      v-if="visualEvidenceItems.length || visualMissingInfoForPath.length"
      id="diagnose-result-visual-evidence"
      class="mb-3"
    >
      <text class="block text-sm font-semibold text-gray-900 mb-2">照片提供的信息</text>
      <view class="bg-[#F8F6F0] rounded-xl p-3 border border-[#E7E0D1]">
        <text class="block text-[10px] text-gray-500 mb-2"
          >已参考 {{ visualEvidenceImageCount || 1 }} 张照片；下面是照片线索，不等同于最终病因。</text
        >
        <view v-for="item in visualEvidenceItems" :key="item.symptomKey" class="mb-1 last:mb-0">
          <text class="text-[11px] text-gray-700">{{ item.displayNameCn || item.symptomKey }}</text>
          <text v-if="item.supportImageCount > 1" class="text-[10px] text-gray-500"
            >· 来自 {{ item.supportImageCount }} 张照片</text
          >
        </view>
        <view v-if="visualMissingInfoForPath.length" class="mt-2 border-t border-[#E7E0D1] pt-2">
          <text class="block text-[10px] font-semibold text-[#8B7355]">还需要核实</text>
          <text
            v-for="item in visualMissingInfoForPath"
            :key="`${item.dimensionKey}-${item.reasonCn}`"
            class="block mt-1 text-[10px] leading-relaxed text-gray-600"
            >{{ item.reasonCn }}</text
          >
        </view>
      </view>
    </view>
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
          data-advice-section="action"
          :data-advice-group-key="group.key"
          class="mb-2 last:mb-0"
        >
          <text
            v-if="group.showOutcomeLabel"
            class="block text-[11px] text-gray-800 font-semibold mb-1"
            >{{ group.displayLabel || group.symptomLabel || group.outcomeLabel }}：</text
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
        <view
          v-for="group in avoidAdviceGroups"
          :key="`avoid_${group.key}`"
          data-advice-section="avoid"
          :data-advice-group-key="group.key"
          class="mb-2 last:mb-0"
        >
          <text
            v-if="group.showOutcomeLabel"
            class="block text-[11px] text-gray-800 font-semibold mb-1"
            >{{ group.displayLabel || group.symptomLabel || group.outcomeLabel }}：</text
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
    return exposed
  }
}
</script>

<style scoped src="./style.css"></style>
