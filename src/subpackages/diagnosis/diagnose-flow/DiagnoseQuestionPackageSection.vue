<template>
    <view
      v-if="hasActiveDiagnosisQuestions"
      id="diagnose-result-question-package-required"
      class="mb-3"
    >
      <text class="block text-sm font-semibold text-gray-900 mb-2">继续问诊</text>
      <view class="bg-gray-50 rounded-xl p-3">
        <text class="block text-[10px] text-gray-500 mb-3">
          每次只回答一个关键问题。答题与补图是两种正式方式，需要分开提交。</text
        >
        <view
          v-if="currentQuestion"
          id="diagnose-question-package-swiper"
          class="question-package-swiper"
        >
          <view class="question-package-swiper-track" :style="questionSwiperTrackStyle">
            <view
              v-for="(question, pageIndex) in questionSwiperPages"
              :key="getQuestionId(question) || `question-package-placeholder-${pageIndex}`"
              class="question-package-swiper-item"
            >
              <view
                v-if="question"
                :key="getQuestionId(question)"
                :id="`diagnose-question-package-question-${getQuestionId(question)}`"
                class="question-package-question-card question-package-question-card--animated"
              >
                <text class="block text-[10px] text-[#8B7355] mb-1">
                  当前问题 {{ activeQuestionIndex + 1 }} / {{ questionStack.length || 1 }}</text
                >
                <text class="block text-xs font-semibold text-gray-900 leading-relaxed mb-1">
                  {{ getQuestionTitle(question) }}</text
                >
                <view
                  v-if="question.riskNotice || question.requiresExplicitConsent"
                  :id="`diagnose-question-risk-notice-${getQuestionId(question)}`"
                  class="mb-2 rounded-xl bg-[#FFF6F3] px-3 py-2"
                >
                  <text class="block text-[10px] font-semibold text-[#8B3A2F]">操作提醒</text>
                  <text class="mt-1 block text-[10px] leading-relaxed text-[#8B3A2F]">
                    {{ question.riskNotice || '不方便操作时可以跳过。' }}</text
                  >
                  <text
                    v-if="getQuestionSafetyInstructionsText(question)"
                    class="mt-1 block text-[10px] leading-relaxed text-[#8B3A2F]"
                  >
                    {{ getQuestionSafetyInstructionsText(question) }}</text
                  >
                  <view v-if="question.requiresExplicitConsent" class="mt-2 flex gap-2">
                    <button
                      :id="`diagnose-question-risk-consent-${getQuestionId(question)}`"
                      class="h-[34px] flex-1 rounded-lg p-0 text-[11px] leading-[34px]"
                      :class="
                        hasQuestionRiskConsent(question)
                          ? 'bg-[#2D6A4F] text-white'
                          : 'bg-white text-[#8B3A2F]'
                      "
                      @click="confirmQuestionRisk(question)"
                    >
                      我愿意操作
                    </button>
                    <button
                      :id="`diagnose-question-risk-skip-${getQuestionId(question)}`"
                      class="h-[34px] flex-1 rounded-lg bg-white p-0 text-[11px] leading-[34px] text-[#8B3A2F]"
                      @click="skipQuestionRisk(question)"
                    >
                      不敢操作 / 跳过
                    </button>
                  </view></view
                >
                <text
                  v-if="getQuestionHelpText(question)"
                  class="block text-[10px] text-gray-500 leading-relaxed mb-3"
                >
                  {{ getQuestionHelpText(question) }}</text
                >
                <CareBehaviorTimeline
                  v-if="isCareBehaviorWateringTimelineQuestion(question)"
                  :question-id="getQuestionId(question)"
                  :question="question"
                  :timeline="getCareBehaviorTimelineByQuestion(question)"
                  :loading="environmentWeatherWindowLoading"
                  :error="environmentWeatherWindowError"
                  :enable-dose-per-date="true"
                  :pot-volume-ml="0"
                  @change="payload => handleCareBehaviorTimelineChange(question, payload)"
                />
                <view
                  :id="`diagnose-question-package-option-stack-${getQuestionId(question)}`"
                  v-if="getVisibleCareBehaviorOptions(question).length"
                  class="question-package-option-stack"
                  :class="
                    question.uiVariant === 'single_select_accordion'
                      ? 'question-package-option-stack--accordion'
                      : ''
                  "
                >
                  <uni-collapse
                    v-if="isAccordionQuestion(question)"
                    :id="`diagnose-question-package-collapse-${getQuestionId(question)}`"
                    v-model="currentQuestionAccordionValue"
                    accordion
                    :border="false"
                    class="question-package-option-collapse"
                    @change="handleQuestionAccordionChange(question, $event)"
                  >
                    <uni-collapse-item
                      v-for="option in getVisibleCareBehaviorOptions(question)"
                      :key="option.optionId"
                      :name="option.optionId"
                      :title="getOptionText(question, option)"
                      :border="false"
                      :title-border="false"
                      class="question-package-option-collapse-item"
                    >
                      <template #title>
                        <view
                          class="question-package-option-accordion-title"
                          :class="[
                            isSelectedQuestionOption(question, option)
                              ? 'question-package-option-accordion-title--active'
                              : 'question-package-option-accordion-title--idle',
                            isQuestionRiskOptionBlocked(question, option) ? 'opacity-50' : ''
                          ]"
                        >
                          <text class="question-package-option-accordion-text">{{
                            getOptionText(question, option)
                          }}</text>
                          <text class="question-package-option-accordion-badge">
                            {{ isSelectedQuestionOption(question, option) ? '已选' : '单选' }}</text
                          ></view
                        ></template
                      >
                      <view
                        :id="`diagnose-question-package-option-${getQuestionId(question)}-${getQuestionOptionId(option)}`"
                        class="question-package-option-collapse-body"
                        :class="[
                          isSelectedQuestionOption(question, option)
                            ? 'question-package-option-collapse-body--active'
                            : '',
                          isQuestionRiskOptionBlocked(question, option) ? 'opacity-50' : ''
                        ]"
                        @click.stop="selectQuestionOption(question, option)"
                      >
                        <text class="question-package-option-description">
                          {{ getOptionDescription(option) || '选择这一项后继续下一步排查。' }}</text
                        ></view
                      ></uni-collapse-item
                    ></uni-collapse
                  >
                  <template v-else>
                    <view
                      v-for="option in getVisibleCareBehaviorOptions(question)"
                      :key="option.optionId"
                      :id="`diagnose-question-package-option-${getQuestionId(question)}-${getQuestionOptionId(option)}`"
                      class="question-package-option-button"
                      style="
                        width: 100%;
                        display: flex;
                        justify-content: flex-start;
                        text-align: left;
                      "
                      :class="[
                        isSelectedQuestionOption(question, option)
                          ? 'question-package-option-button--active'
                          : 'question-package-option-button--idle',
                        isQuestionRiskOptionBlocked(question, option) ? 'opacity-50' : ''
                      ]"
                      @click="selectQuestionOption(question, option)"
                    >
                      <view class="question-package-option-content">
                        <view class="question-package-option-title-row">
                          <text class="question-package-option-text">{{
                            getOptionText(question, option)
                          }}</text></view
                        >
                        <text
                          v-if="getOptionDescription(option)"
                          class="question-package-option-description"
                        >
                          {{ getOptionDescription(option) }}</text
                        ></view
                      ></view
                    ></template
                  ></view
                >
                <view class="question-package-nav-row">
                  <button
                    id="diagnose-question-package-prev-button"
                    class="question-package-nav-button"
                    :class="{
                      'question-package-nav-button--disabled':
                        isSubmittingQuestionFlow || activeQuestionIndex <= 0
                    }"
                    :disabled="isSubmittingQuestionFlow || activeQuestionIndex <= 0"
                    @click="goPreviousQuestion"
                  >
                    上一题
                  </button>
                  <button
                    id="diagnose-question-package-next-button"
                    class="question-package-nav-button"
                    :class="{
                      'question-package-nav-button--disabled': !canProceedQuestionNow
                    }"
                    :disabled="!canProceedQuestionNow"
                    @click="handleNextQuestion"
                  >
                    {{ isOptionalFollowUpQuestion ? '提交（可不答）' : '下一题' }}
                  </button>
                </view>
                <text
                  v-if="hasDirtyQuestionAnswers"
                  class="block text-[10px] text-[#8B7355] leading-relaxed mt-2"
                >
                  你修改了之前的答案，点下一题后后续问题会交给后端重新判断。
                </text>
              </view>
            </view>
          </view>
        </view>
        <view
          v-else
          id="diagnose-question-package-empty-question"
          class="px-3 py-2 rounded-xl bg-white border border-gray-100"
        >
          <text class="block text-[10px] text-gray-500"> 当前没有可继续回答的问题。</text></view
        >
        <text
          v-if="
            additionalImageFiles.length ||
            hasPendingAdditionalImageUploads ||
            hasAdditionalImageUploadErrors
          "
          class="block text-[10px] text-[#8B7355] mt-3"
        >
          当前有待处理补图，请先完成补图提交或清空补图后再继续下一题。</text
        ></view
      ></view
    >
    <view
      v-if="(hasActiveDiagnosisQuestions || hasRetakeRequest) && !retakeExpired"
      id="diagnose-question-package-image-section"
      class="mb-3"
    >
      <text class="block text-sm font-semibold text-gray-900 mb-2">补充图片</text>
      <view class="bg-[#F8F6F0] rounded-xl p-3 border border-[#D8F3DC]">
        <text class="block text-[10px] text-gray-500 mb-2">
          当前阶段最多补图 1 次。若补图，将生成新的视觉调用批次并重建视觉证据。</text
        >
        <view
          v-if="additionalImageCaptureSuggestions.length"
          id="diagnose-question-package-capture-suggestions"
          class="mb-3"
        >
          <text class="block text-[11px] font-semibold text-gray-800 mb-1">建议优先补拍</text>
          <view
            v-for="item in additionalImageCaptureSuggestions"
            :key="item"
            class="mb-1 last:mb-0 px-2.5 py-2 rounded-lg bg-white text-[11px] text-gray-700"
          >
            {{ item }}</view
          ></view
        >
        <view v-if="canShowAdditionalImageUploader">
          <view id="diagnose-question-package-upload-slot-grid" class="slot-grid">
            <view
              v-for="slot in additionalImageSlotGroups"
              :key="slot.slotType"
              :id="`diagnose-question-package-upload-slot-${slot.slotType}`"
              class="slot-card bg-white border border-[#E7E0D1]"
            >
              <view class="flex items-start justify-between gap-2 mb-2">
                <view class="min-w-0 flex-1">
                  <text class="block text-xs font-semibold text-gray-900">{{ slot.label }}</text>
                  <text class="block text-[10px] text-gray-500 mt-0.5">
                    {{
                      slot.items.length ? `已放入 ${slot.items.length} 张` : '点击补到此槽位'
                    }}</text
                  ></view
                >
                <text class="text-[10px] text-[#8B7355]"
                  >{{ slot.items.length }}/{{ slot.capacity }}</text
                ></view
              >
              <view class="slot-thumb-grid">
                <view
                  v-for="entry in slot.items"
                  :key="entry.item.id"
                  class="relative aspect-square bg-[#F8F6F0] rounded-xl overflow-hidden"
                >
                  <image :src="entry.item.previewUrl" class="w-full h-full" mode="aspectFill" />
                  <view
                    v-if="entry.item.loading"
                    class="absolute inset-0 bg-white/75 flex flex-col items-center justify-center"
                  >
                    <view class="upload-spinner mb-2" />
                    <text class="text-[11px] text-[#2D6A4F] font-medium">上传中</text></view
                  >
                  <view
                    v-else-if="entry.item.status === 'error'"
                    class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
                  >
                    <text class="block text-[10px] text-white leading-tight">
                      {{ entry.item.error || '上传失败' }}</text
                    ></view
                  >
                  <view
                    class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                    :id="`diagnose-question-package-remove-image-${entry.index}-button`"
                    @click.stop="removeAdditionalImage(entry.index)"
                  >
                    <text class="text-white text-xs">×</text></view
                  ></view
                >
                <view
                  v-if="slot.canAdd"
                  :id="`diagnose-question-package-upload-${slot.slotType}-button`"
                  class="aspect-square bg-[#FFFDF8] rounded-xl flex flex-col items-center justify-center border border-dashed border-[#B7DCC5]"
                  @click="chooseAdditionalImage(slot.slotType)"
                >
                  <text class="text-xl text-[#8FB69B] mb-0.5">+</text>
                  <text class="text-[9px] text-[#8FB69B] text-center px-1">补到此槽位</text></view
                ></view
              ></view
            ></view
          >
          <view class="flex items-center justify-between mt-3 mb-1">
            <text class="text-[10px] text-gray-400">
              {{ additionalImageFiles.length }}/{{ ADDITIONAL_IMAGE_LIMIT }} 张
            </text>
            <text
              id="diagnose-question-package-clear-images-button"
              class="text-[10px] text-[#8B7355]"
              @click="resetAdditionalImages"
            >
              清空补图
            </text>
          </view>
          <text
            v-if="hasPendingAdditionalImageUploads"
            class="block text-[10px] text-[#2D6A4F] text-center mt-1"
          >
            补图上传中，处理完成后可提交
          </text>
          <text
            v-else-if="hasAdditionalImageUploadErrors"
            class="block text-[10px] text-red-500 text-center mt-1"
          >
            存在上传失败的补图，请删除后重新添加
          </text>
        </view>
        <view
          v-else
          id="diagnose-question-package-upload-blocked"
          class="px-3 py-2.5 rounded-xl bg-white"
        >
          <text class="block text-[11px] text-gray-600">
            {{ additionalImageUploadBlockedReason }}
          </text>
        </view>
      </view>
    </view>
</template>

<script>
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import { exposeViewProp } from '@/utils/component-view-proxy.js'
import { DIAGNOSE_VIEW_DEFAULTS } from './view-defaults.js'

export default {
  components: { CareBehaviorTimeline },
  props: {
    view: { type: Object, required: true }
  },
  setup(props) {
    // 该子组件只负责渲染问诊题包 + 补图区块；所有响应式状态与方法都来自父级传入的 view。
    // 与 DiagnoseResultStage.vue 保持同一代理策略（exposeViewProp + DIAGNOSE_VIEW_DEFAULTS 兜底）。
    return exposeViewProp(props, DIAGNOSE_VIEW_DEFAULTS)
  }
}
</script>

<style scoped src="./style.css"></style>
