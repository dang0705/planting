<template>
  <uni-popup ref="popup" type="bottom" :safe-area="false" @change="handleChange">
    <view class="bg-white rounded-t-3xl popup-panel" :style="popupPanelStyle">
      <view
        v-if="automationEnabled"
        id="diagnose-automation-inject-button"
        class="diagnose-automation-trigger"
        @click="injectAutomationDiagnoseImagesFromStorage"
      />
      <view class="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <text class="text-lg font-semibold text-gray-900">AI 诊断</text>
        <view id="diagnose-popup-close-button" class="w-8 h-8 flex items-center justify-center" @click="close">
          <text class="text-gray-400 text-2xl">×</text>
        </view>
      </view>

      <view class="popup-content-wrap">
        <scroll-view scroll-y class="popup-scroll">
          <view class="px-4 py-4">
        <view v-if="!result">
          <view class="mb-4">
            <text class="block text-base font-semibold text-gray-900 mb-2">拍摄植物照片</text>
            <text class="block text-xs text-gray-500 mb-3">请直接在槽位中上传。单槽最多 2 张，总计最多 3 张。</text>

            <view v-if="automationEnabled" class="dev-visual-evidence-panel">
              <view class="flex items-start justify-between gap-2 mb-2">
                <view class="min-w-0 flex-1">
                  <text class="block text-xs font-semibold text-[#1F5A42]">开发调试：模拟视觉证据</text>
                  <text class="block text-[10px] text-gray-500 mt-0.5">
                    选择后可不上传图片，直接用该症状类启动诊断，不调用视觉模型。
                  </text>
                </view>
                <text class="dev-visual-evidence-tag">DEV</text>
              </view>

              <picker
                mode="selector"
                :range="devVisualSymptomClassPickerLabels"
                :value="selectedDevSymptomClassIndex"
                @change="handleDevSymptomClassChange"
              >
                <view id="diagnose-dev-symptom-class-picker" class="dev-visual-evidence-picker">
                  <view class="min-w-0 flex-1">
                    <text class="block text-xs font-semibold text-gray-900">
                      {{ selectedDevSymptomClassOption?.classNameCn || '不模拟，走真实图片/AI视觉' }}
                    </text>
                    <text
                      v-if="selectedDevSymptomClassOption"
                      class="block text-[10px] text-gray-500 mt-0.5"
                    >
                      {{ selectedDevSymptomClassOption.symptomCn }} · {{ selectedDevSymptomClassOption.classKey }}
                    </text>
                    <text v-else class="block text-[10px] text-gray-500 mt-0.5">
                      下拉选择当前 symptom class
                    </text>
                  </view>
                  <text class="dev-visual-evidence-picker-action">选择</text>
                </view>
              </picker>

              <view v-if="selectedDevSymptomClassOption" class="dev-visual-evidence-status">
                <text class="flex-1 text-[10px] text-[#1F5A42] leading-relaxed">
                  将模拟：{{ selectedDevSymptomClassOption.symptomCn }}（{{ selectedDevSymptomClassOption.classNameCn }}）
                </text>
                <text
                  id="diagnose-dev-symptom-class-clear-button"
                  class="dev-visual-evidence-clear"
                  @click="clearDevSymptomClass"
                >
                  清空
                </text>
              </view>
            </view>

            <view class="slot-grid">
              <view
                v-for="slot in primarySlotGroups"
                :key="slot.slotType"
                class="slot-card bg-[#F8F6F0] border border-white/80"
              >
                <view class="flex items-start justify-between gap-2 mb-2">
                  <view class="min-w-0 flex-1">
                    <text class="block text-xs font-semibold text-gray-900">{{ slot.label }}</text>
                    <text class="block text-[10px] text-gray-500 mt-0.5">
                      {{ slot.items.length ? `已放入 ${slot.items.length} 张` : '点击上传到此槽位' }}
                    </text>
                  </view>
                  <text class="text-[10px] text-[#8B7355]">{{ slot.items.length }}/{{ slot.capacity }}</text>
                </view>

                <view class="slot-thumb-grid">
                  <view
                    v-for="entry in slot.items"
                    :key="entry.item.id"
                    class="relative aspect-square bg-white rounded-xl overflow-hidden"
                  >
                    <image :src="entry.item.previewUrl" class="w-full h-full" mode="aspectFill" />
                    <view
                      v-if="entry.item.loading"
                      class="absolute inset-0 bg-white/75 flex flex-col items-center justify-center"
                    >
                      <view class="upload-spinner mb-2" />
                      <text class="text-[11px] text-[#2D6A4F] font-medium">上传中</text>
                    </view>
                    <view
                      v-else-if="entry.item.status === 'error'"
                      class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
                    >
                      <text class="block text-[10px] text-white leading-tight">
                        {{ entry.item.error || '上传失败' }}
                      </text>
                    </view>
                    <view
                      class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                      :id="`diagnose-remove-image-${entry.index}-button`"
                      @click.stop="removeImage(entry.index)"
                    >
                      <text class="text-white text-xs">×</text>
                    </view>
                  </view>

                  <view
                    v-if="slot.canAdd"
                    :id="`diagnose-upload-${slot.slotType}-button`"
                    class="aspect-square bg-white rounded-xl flex flex-col items-center justify-center border border-dashed border-[#B7DCC5]"
                    @click="chooseImage(slot.slotType)"
                  >
                    <text class="text-xl text-[#8FB69B] mb-0.5">+</text>
                    <text class="text-[9px] text-[#8FB69B] text-center px-1">
                      {{ slot.items.length ? '继续上传' : '上传到此槽位' }}
                    </text>
                  </view>
                </view>
              </view>
            </view>

            <text class="block text-[10px] text-gray-400 text-center mt-2">
              {{ imageFiles.length }}/{{ PRIMARY_IMAGE_LIMIT }} 张
            </text>
            <text v-if="hasPendingUploads" class="block text-[10px] text-[#2D6A4F] text-center mt-1">
              图片上传中，全部处理完成后可开始诊断
            </text>
            <text v-else-if="hasUploadErrors" class="block text-[10px] text-red-500 text-center mt-1">
              存在上传失败的图片，请删除后重新添加
            </text>
          </view>

          <view class="mt-3 bg-[#D8F3DC] rounded-xl p-3">
            <text class="block text-xs font-semibold text-primary mb-1">拍摄建议</text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 光线充足，避免逆光
            </text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 优先保留叶片特写、茎部或根颈近照、整株图
            </text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 若已知部位，请为每张图选择对应槽位
            </text>
          </view>
        </view>

        <view v-if="result">
          <view class="bg-gray-50 rounded-xl p-3 mb-3">
            <view class="flex items-center mb-2">
              <text class="text-2xl mr-2">🌿</text>
              <view class="flex-1">
                <text class="block text-base font-semibold text-gray-900">{{ result.plantName }}</text>
                <text class="block text-xs text-gray-500">{{ result.scientificName || '学名未知' }}</text>
              </view>
            </view>

            <view class="flex items-center justify-between p-2 bg-white rounded-lg">
              <text class="text-xs font-semibold text-gray-700">健康状态</text>
              <view :class="getHealthClass(result.healthStatusText)">
                <text class="text-xs font-bold">{{ result.healthStatusText }}</text>
              </view>
            </view>
          </view>

          <view v-if="result.observedSymptoms?.length" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">观察到的症状</text>
            <view class="bg-gray-50 rounded-xl p-3 flex flex-wrap gap-2">
              <view
                v-for="item in result.observedSymptoms"
                :key="item.symptomKey"
                class="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[11px]"
              >
                {{ item.symptomCn || '待确认症状' }}
              </view>
            </view>
          </view>

          <view v-if="result.mainIssueText || result.summaryText" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">当前结论</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-xs text-gray-800 mb-2">{{ result.mainIssueText }}</text>
              <text class="block text-xs text-gray-600 leading-relaxed whitespace-pre-line">{{
                result.summaryText
              }}</text>
            </view>
          </view>

          <view v-if="actionAdviceTexts.length" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">处理建议</text>
            <view class="bg-[#F3FAF5] rounded-xl p-3">
              <text
                v-for="(item, index) in actionAdviceTexts"
                :key="`action_${index}`"
                class="block text-xs text-gray-700 leading-relaxed mb-2 last:mb-0"
              >
                • {{ item }}
              </text>
            </view>
          </view>

          <view v-if="avoidAdviceTexts.length" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">暂时不要做</text>
            <view class="bg-[#FFF6F3] rounded-xl p-3">
              <text
                v-for="(item, index) in avoidAdviceTexts"
                :key="`avoid_${index}`"
                class="block text-xs text-gray-700 leading-relaxed mb-2 last:mb-0"
              >
                • {{ item }}
              </text>
            </view>
          </view>

          <view v-if="result.followUpRequired" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">继续问诊</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-[10px] text-gray-500 mb-3">
                每次只回答一个关键问题。答题与补图是两条正式路径，需要分开提交。
              </text>
              <swiper
                v-if="currentFollowUpQuestion"
                class="followup-swiper"
                :current="followUpSwiperCurrent"
                :duration="260"
                :indicator-dots="false"
                :circular="false"
              >
                <swiper-item
                  v-for="(question, pageIndex) in followUpSwiperPages"
                  :key="question?.questionId || `followup-placeholder-${pageIndex}`"
                  class="followup-swiper-item"
                >
                  <view
                    v-if="question"
                    :key="question.questionId"
                    class="followup-question-card followup-question-card--animated"
                  >
                    <text class="block text-[10px] text-[#8B7355] mb-1">
                      当前问题 {{ activeFollowUpQuestionIndex + 1 }} / {{ followUpQuestionStack.length || 1 }}
                    </text>
                    <text class="block text-xs font-semibold text-gray-900 leading-relaxed mb-1">
                      {{ question.text }}
                    </text>
                    <text
                      v-if="question.helpText"
                      class="block text-[10px] text-gray-500 leading-relaxed mb-3"
                    >
                      {{ question.helpText }}
                    </text>
                    <view
                      class="followup-option-stack"
                      :class="question.uiVariant === 'single_select_accordion' ? 'followup-option-stack--accordion' : ''"
                    >
                      <uni-collapse
                        v-if="isAccordionFollowUpQuestion(question)"
                        v-model="currentFollowUpAccordionValue"
                        accordion
                        :border="false"
                        class="followup-option-collapse"
                        @change="handleFollowUpAccordionChange(question, $event)"
                      >
                        <uni-collapse-item
                          v-for="option in question.options"
                          :key="option.optionId"
                          :name="option.optionId"
                          :title="option.text"
                          :border="false"
                          :title-border="false"
                          class="followup-option-collapse-item"
                        >
                          <template #title>
                            <view
                              class="followup-option-accordion-title"
                            :class="
                              isSelectedFollowUpOption(question, option)
                                ? 'followup-option-accordion-title--active'
                                : 'followup-option-accordion-title--idle'
                            "
                          >
                            <text class="followup-option-accordion-text">{{ option.text }}</text>
                            <text class="followup-option-accordion-badge">
                              {{ isSelectedFollowUpOption(question, option) ? '已选' : '单选' }}
                            </text>
                          </view>
                        </template>
                        <view
                          :id="`diagnose-followup-option-${question.questionId}-${option.optionId}`"
                          class="followup-option-collapse-body"
                          :class="
                            isSelectedFollowUpOption(question, option)
                              ? 'followup-option-collapse-body--active'
                              : ''
                          "
                          @click.stop="selectFollowUpOption(question, option)"
                        >
                            <text class="followup-option-description">
                              {{ option.description || '选择这一项后继续下一步排查。' }}
                            </text>
                          </view>
                        </uni-collapse-item>
                      </uni-collapse>
                      <template v-else>
                        <view
                          v-for="option in question.options"
                          :key="option.optionId"
                          :id="`diagnose-followup-option-${question.questionId}-${option.optionId}`"
                          class="followup-option-button"
                          style="width: 100%; display: flex; justify-content: flex-start; text-align: left;"
                          :class="
                            followUpAnswers[question.questionId] === option.optionId
                              ? 'followup-option-button--active'
                              : 'followup-option-button--idle'
                          "
                          @click="selectFollowUpOption(question, option)"
                        >
                          <view class="followup-option-content">
                            <view class="followup-option-title-row">
                              <text class="followup-option-text">{{ option.text }}</text>
                            </view>
                            <text
                              v-if="option.description"
                              class="followup-option-description"
                            >
                              {{ option.description }}
                            </text>
                          </view>
                        </view>
                      </template>
                    </view>
                    <view class="followup-nav-row">
                      <button
                        id="diagnose-followup-prev-button"
                        class="followup-nav-button"
                        :class="{ 'followup-nav-button--disabled': isSubmittingAnyFollowUp || activeFollowUpQuestionIndex <= 0 }"
                        :disabled="isSubmittingAnyFollowUp || activeFollowUpQuestionIndex <= 0"
                        @click="goPreviousFollowUpQuestion"
                      >
                        上一题
                      </button>
                      <button
                        id="diagnose-followup-next-button"
                        class="followup-nav-button"
                        :class="{ 'followup-nav-button--disabled': !canProceedFollowUpQuestion() }"
                        :disabled="!canProceedFollowUpQuestion()"
                        @click="handleNextFollowUpQuestion"
                      >
                        下一题
                      </button>
                    </view>
                    <text
                      v-if="hasDirtyFollowUpAnswers"
                      class="block text-[10px] text-[#8B7355] leading-relaxed mt-2"
                    >
                      你修改了之前的答案，点下一题后后续问题会交给后端重新判断。
                    </text>
                  </view>
                </swiper-item>
              </swiper>
              <view v-else class="px-3 py-2 rounded-xl bg-white border border-gray-100">
                <text class="block text-[10px] text-gray-500">
                  当前没有可继续回答的问题。
                </text>
              </view>
              <text
                v-if="followUpImageFiles.length || hasPendingFollowUpUploads || hasFollowUpUploadErrors"
                class="block text-[10px] text-[#8B7355] mt-3"
              >
                当前有待处理补图，请先完成补图提交或清空补图后再继续下一题。
              </text>
            </view>
          </view>

          <view v-if="result.followUpRequired" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">补充图片</text>
            <view class="bg-[#F8F6F0] rounded-xl p-3 border border-[#D8F3DC]">
              <text class="block text-[10px] text-gray-500 mb-2">
                当前阶段最多补图 1 次。若补图，将生成新的视觉调用批次并重建视觉证据。
              </text>

              <view v-if="followUpCaptureSuggestions.length" class="mb-3">
                <text class="block text-[11px] font-semibold text-gray-800 mb-1">建议优先补拍</text>
                <view
                  v-for="item in followUpCaptureSuggestions"
                  :key="item"
                  class="mb-1 last:mb-0 px-2.5 py-2 rounded-lg bg-white text-[11px] text-gray-700"
                >
                  {{ item }}
                </view>
              </view>

              <view v-if="canShowFollowUpUploader">
                <view class="slot-grid">
                  <view
                    v-for="slot in followUpSlotGroups"
                    :key="slot.slotType"
                    class="slot-card bg-white border border-[#E7E0D1]"
                  >
                    <view class="flex items-start justify-between gap-2 mb-2">
                      <view class="min-w-0 flex-1">
                        <text class="block text-xs font-semibold text-gray-900">{{ slot.label }}</text>
                        <text class="block text-[10px] text-gray-500 mt-0.5">
                          {{ slot.items.length ? `已放入 ${slot.items.length} 张` : '点击补到此槽位' }}
                        </text>
                      </view>
                      <text class="text-[10px] text-[#8B7355]">{{ slot.items.length }}/{{ slot.capacity }}</text>
                    </view>

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
                          <text class="text-[11px] text-[#2D6A4F] font-medium">上传中</text>
                        </view>
                        <view
                          v-else-if="entry.item.status === 'error'"
                          class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
                        >
                          <text class="block text-[10px] text-white leading-tight">
                            {{ entry.item.error || '上传失败' }}
                          </text>
                        </view>
                        <view
                          class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                          :id="`diagnose-followup-remove-image-${entry.index}-button`"
                          @click.stop="removeFollowUpImage(entry.index)"
                        >
                          <text class="text-white text-xs">×</text>
                        </view>
                      </view>

                      <view
                        v-if="slot.canAdd"
                        :id="`diagnose-followup-upload-${slot.slotType}-button`"
                        class="aspect-square bg-[#FFFDF8] rounded-xl flex flex-col items-center justify-center border border-dashed border-[#B7DCC5]"
                        @click="chooseFollowUpImage(slot.slotType)"
                      >
                        <text class="text-xl text-[#8FB69B] mb-0.5">+</text>
                        <text class="text-[9px] text-[#8FB69B] text-center px-1">补到此槽位</text>
                      </view>
                    </view>
                  </view>
                </view>

                <view class="flex items-center justify-between mt-3 mb-1">
                  <text class="text-[10px] text-gray-400">
                    {{ followUpImageFiles.length }}/{{ FOLLOW_UP_IMAGE_LIMIT }} 张
                  </text>
                  <text
                    id="diagnose-followup-clear-images-button"
                    class="text-[10px] text-[#8B7355]"
                    @click="resetFollowUpUploads"
                  >清空补图</text>
                </view>
                <text v-if="hasPendingFollowUpUploads" class="block text-[10px] text-[#2D6A4F] text-center mt-1">
                  补图上传中，处理完成后可提交
                </text>
                <text v-else-if="hasFollowUpUploadErrors" class="block text-[10px] text-red-500 text-center mt-1">
                  存在上传失败的补图，请删除后重新添加
                </text>

              </view>

              <view v-else class="px-3 py-2.5 rounded-xl bg-white">
                <text class="block text-[11px] text-gray-600">
                  {{ followUpUploadBlockedReason }}
                </text>
              </view>
            </view>
          </view>

        </view>
          </view>
        </scroll-view>
      </view>

      <view class="popup-footer">
        <view v-if="!result">
          <button
            id="diagnose-submit-button"
            class="w-full bg-primary text-white font-semibold py-3 rounded-xl"
            :class="{ 'opacity-50': !canStartDiagnose() }"
            :disabled="!canStartDiagnose()"
            @click="startDiagnose"
          >
            开始诊断
          </button>
        </view>

        <view v-else class="space-y-2">
          <button
            v-if="result.followUpRequired && canShowFollowUpUploader"
            id="diagnose-followup-image-submit-button"
            class="w-full bg-[#2D6A4F] text-white py-2.5 rounded-xl text-sm"
            :class="{ 'opacity-50': isSubmittingAnyFollowUp || !canSubmitFollowUpImages() }"
            :disabled="isSubmittingAnyFollowUp || !canSubmitFollowUpImages()"
            @click="submitFollowUpImages"
          >
            {{ isSubmittingFollowUpImage ? '补图诊断中...' : '提交补图并重新诊断' }}
          </button>

          <view class="flex gap-2">
            <button
              id="diagnose-reset-button"
              class="flex-1 bg-white border border-primary text-primary font-semibold py-2.5 rounded-xl text-sm"
              @click="resetDiagnose"
            >
              重新诊断
            </button>
            <button
              id="diagnose-finish-button"
              class="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl text-sm"
              @click="close"
            >
              完成
            </button>
          </view>
        </view>
      </view>
    </view>

    <AIStreamDialog
      ref="aiStreamDialogRef"
      :visible="showAIDialog"
      title="AI 智能诊断"
      icon="🩺"
      loading-text="正在诊断植物健康..."
      confirm-text="进入问诊"
      cancel-text="稍后再说"
      :show-cancel="true"
      @close="handleAIDialogClose"
      @cancel="handleAIDialogCancel"
      @confirm="handleAIDialogConfirm"
      @retry="handleAIRetry"
    />
  </uni-popup>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useUserStore } from '@/store/user.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { useCloudImageUploader } from '@/composables/useCloudImageUploader'
import { useDiagnoseMutation } from '@/vue-query/diagnose/mutations/useDiagnoseMutation.js'
import { useDiagnoseFollowUpMutation } from '@/vue-query/diagnose/mutations/useDiagnoseFollowUpMutation.js'
import {
  normalizeDiagnosisResult,
  createFollowUpAnswerMap,
  isFollowUpAnswerComplete,
  buildFollowUpPayload,
  getHealthClass
} from '@/utils/diagnose-flow.js'
import {
  PRIMARY_IMAGE_LIMIT,
  FOLLOW_UP_IMAGE_LIMIT,
  PRIMARY_SLOT_SEQUENCE,
  FOLLOW_UP_SLOT_SEQUENCE,
  getOrganOptionLabel,
  normalizeSlotType,
  getSlotCapacity,
  getSlotFileCount,
  buildSlotGroups,
  buildSlotMetadata,
  inferFollowUpSlotTypeFromSuggestion
} from '@/utils/diagnose-image-slots.js'
import AIStreamDialog from './AIStreamDialog.vue'

const props = defineProps({
  plantId: {
    type: [String, Number],
    default: ''
  },
  plantName: {
    type: String,
    default: ''
  },
  observedSymptoms: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['success', 'close'])

const userStore = useUserStore()
const diagnoseStore = useDiagnoseStore()

const popup = ref(null)
const result = ref(null)
const showAIDialog = ref(false)
const aiStreamDialogRef = ref(null)
const pendingDiagnosePayload = ref(null)
const casePreviewImages = ref([])
const followUpAnswers = ref({})
const followUpQuestionStack = ref([])
const activeFollowUpQuestionIndex = ref(0)
const committedFollowUpAnswers = ref({})
const dirtyFollowUpFromIndex = ref(-1)
const followUpAnswerRevision = ref(0)
const expandedFollowUpOptionByQuestion = ref({})
const submittingFollowUpMode = ref('')
const viewportHeight = ref(0)
const tabBarOccupiedHeight = ref(50)
const followUpSwiperCurrent = ref(0)
const followUpSwiperPages = ref([null, null])

const diagnoseMutation = useDiagnoseMutation()
const followUpMutation = useDiagnoseFollowUpMutation()

const uploader = useCloudImageUploader({
  count: PRIMARY_IMAGE_LIMIT,
  size: 5,
  suffix: ['jpg', 'jpeg', 'png', 'webp'],
  sizeType: ['compressed'],
  compressionRate: 72,
  compressionTargetSize: 0.45,
  forceCompression: true,
  preserveImageDetails: false
})
const followUpUploader = useCloudImageUploader({
  count: FOLLOW_UP_IMAGE_LIMIT,
  size: 5,
  suffix: ['jpg', 'jpeg', 'png', 'webp'],
  sizeType: ['compressed'],
  compressionRate: 72,
  compressionTargetSize: 0.45,
  forceCompression: true,
  preserveImageDetails: false
})

const imageFiles = uploader.files
const hasPendingUploads = uploader.hasPendingUploads
const hasUploadErrors = uploader.hasUploadErrors
const followUpImageFiles = followUpUploader.files
const hasPendingFollowUpUploads = followUpUploader.hasPendingUploads
const hasFollowUpUploadErrors = followUpUploader.hasUploadErrors
const runtimeEnv = import.meta.env || {}
const isLocalDevelopmentBuild = Boolean(runtimeEnv.DEV) || runtimeEnv.MODE === 'development'
let automationEnabled =
  runtimeEnv.VITE_APP_ENV === 'development' ||
  (isLocalDevelopmentBuild && runtimeEnv.VITE_APP_ENV !== 'production')
// #ifdef MP-WEIXIN
automationEnabled =
  runtimeEnv.VITE_APP_ENV === 'development' ||
  (!runtimeEnv.PROD && runtimeEnv.VITE_APP_ENV !== 'production')
// #endif
const AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY = '__plantsight_diagnose_automation_images__'
const DIAGNOSIS_FOLLOW_UP_STORAGE_KEY_PREFIX = '__plantsight_diagnose_follow_up__'
const DEV_VISUAL_SYMPTOM_CLASS_OPTIONS = [
  { classKey: 'yellowing_mode', classNameCn: '黄叶模式', symptomKey: 'uniform_yellowing', symptomCn: '整叶黄化' },
  { classKey: 'bacterial_leaf_spot_mode', classNameCn: '细菌性叶斑模式', symptomKey: 'water_soaked_spots', symptomCn: '水渍斑' },
  { classKey: 'chewing_pest_mode', classNameCn: '咀嚼损伤虫害模式', symptomKey: 'holes_in_leaf', symptomCn: '叶片穿孔' },
  { classKey: 'edema_overwater_mode', classNameCn: '水肿/过湿模式', symptomKey: 'edema', symptomCn: '水肿' },
  { classKey: 'flower_stress_mode', classNameCn: '花器胁迫模式', symptomKey: 'bud_drop', symptomCn: '掉花苞' },
  { classKey: 'fungal_leaf_spot_mode', classNameCn: '真菌性叶斑模式', symptomKey: 'brown_spots_halo', symptomCn: '褐斑带黄晕' },
  { classKey: 'general_stress_mode', classNameCn: '泛胁迫兜底模式', symptomKey: 'distorted_growth', symptomCn: '整体畸形' },
  { classKey: 'gray_mold_mode', classNameCn: '灰霉模式', symptomKey: 'gray_fuzzy_mold', symptomCn: '灰色绒霉' },
  { classKey: 'humidity_stress_mode', classNameCn: '湿度胁迫模式', symptomKey: 'low_humidity_damage', symptomCn: '低湿伤害' },
  { classKey: 'leaf_edge_necrosis_mode', classNameCn: '叶缘坏死模式', symptomKey: 'leaf_margin_necrosis', symptomCn: '叶缘坏死' },
  { classKey: 'leaf_spot_complex_mode', classNameCn: '复合叶斑模式', symptomKey: 'irregular_blotches', symptomCn: '不规则斑块' },
  { classKey: 'leafminer_mode', classNameCn: '潜叶损伤模式', symptomKey: 'tunnels_in_leaf', symptomCn: '叶内潜道' },
  { classKey: 'light_stress_mode', classNameCn: '光照胁迫模式', symptomKey: 'leaf_bleaching', symptomCn: '叶片漂白' },
  { classKey: 'mechanical_damage_mode', classNameCn: '机械损伤模式', symptomKey: 'wind_damage', symptomCn: '风伤' },
  { classKey: 'mite_damage_mode', classNameCn: '螨害模式', symptomKey: 'fine_webbing', symptomCn: '细密蛛网' },
  { classKey: 'natural_aging_mode', classNameCn: '自然老化模式', symptomKey: 'normal_leaf_aging_stable', symptomCn: '底部老叶稳定黄化' },
  { classKey: 'nutrient_stress_mode', classNameCn: '营养胁迫模式', symptomKey: 'vein_darkening', symptomCn: '叶脉变深' },
  { classKey: 'powdery_mildew_mode', classNameCn: '白粉模式', symptomKey: 'white_fuzz', symptomCn: '白色菌丝' },
  { classKey: 'root_rot_wet_wilt_mode', classNameCn: '湿土萎蔫/根腐模式', symptomKey: 'wilting_wet_soil', symptomCn: '湿土萎蔫' },
  { classKey: 'rust_mode', classNameCn: '锈病模式', symptomKey: 'rust_pustules', symptomCn: '锈孢子堆' },
  { classKey: 'salt_dry_edge_mode', classNameCn: '盐害/干边模式', symptomKey: 'tip_burn', symptomCn: '叶尖焦枯' },
  { classKey: 'sap_sucking_honeydew_pest_mode', classNameCn: '刺吸蜜露型虫害模式', symptomKey: 'white_flies', symptomCn: '有白色小飞虫，一碰会飞起来' },
  { classKey: 'soft_rot_mode', classNameCn: '软腐模式', symptomKey: 'soft_stem', symptomCn: '茎变软' },
  { classKey: 'soil_moisture_pest_mode', classNameCn: '盆土过湿相关模式', symptomKey: 'small_flies_soil', symptomCn: '土壤小飞虫' },
  { classKey: 'temperature_stress_mode', classNameCn: '温度胁迫模式', symptomKey: 'heat_stress', symptomCn: '高温胁迫' },
  { classKey: 'thrips_damage_mode', classNameCn: '蓟马损伤模式', symptomKey: 'yellow_speckling', symptomCn: '点刺状黄化' },
  { classKey: 'virus_mosaic_mode', classNameCn: '病毒花叶模式', symptomKey: 'leaf_mosaic_mottling', symptomCn: '叶子上有深浅不一、花花绿绿的斑驳花纹' },
  { classKey: 'water_stress_mode', classNameCn: '水分胁迫模式', symptomKey: 'wilting_dry_soil', symptomCn: '干土萎蔫' }
]

const selectedDevSymptomClassKey = ref('')

const primaryStructuredImages = computed(() => buildStructuredImageInputs(imageFiles.value))
const followUpStructuredImages = computed(() => buildStructuredImageInputs(followUpImageFiles.value))
const devVisualSymptomClassPickerOptions = computed(() => [
  { classKey: '', pickerLabel: '不模拟，走真实图片/AI视觉' },
  ...DEV_VISUAL_SYMPTOM_CLASS_OPTIONS.map(item => ({
    ...item,
    pickerLabel: `${item.classNameCn} / ${item.symptomCn}`
  }))
])
const devVisualSymptomClassPickerLabels = computed(() =>
  devVisualSymptomClassPickerOptions.value.map(item => item.pickerLabel)
)
const selectedDevSymptomClassOption = computed(() =>
  DEV_VISUAL_SYMPTOM_CLASS_OPTIONS.find(item => item.classKey === selectedDevSymptomClassKey.value) || null
)
const selectedDevSymptomClassIndex = computed(() => {
  const index = devVisualSymptomClassPickerOptions.value.findIndex(
    item => item.classKey === selectedDevSymptomClassKey.value
  )
  return index >= 0 ? index : 0
})
const hasDevVisualEvidence = computed(() => automationEnabled && Boolean(selectedDevSymptomClassOption.value))
const followUpCaptureSuggestions = computed(() =>
  Array.isArray(result.value?.visualAggregateSummary?.suggestedFollowupCapture)
    ? result.value.visualAggregateSummary.suggestedFollowupCapture
    : []
)
const followUpSlotTypes = computed(() => {
  const inferredSlotTypes = uniqueStrings(
    followUpCaptureSuggestions.value.map(item => inferFollowUpSlotTypeFromSuggestion(item, 'whole_plant'))
  )

  if (inferredSlotTypes.length) {
    return uniqueStrings([...inferredSlotTypes, 'other'])
  }

  return [...FOLLOW_UP_SLOT_SEQUENCE]
})
const primarySlotGroups = computed(() =>
  buildSlotGroups(imageFiles.value, PRIMARY_SLOT_SEQUENCE, PRIMARY_IMAGE_LIMIT)
)
const followUpSlotGroups = computed(() =>
  buildSlotGroups(followUpImageFiles.value, followUpSlotTypes.value, FOLLOW_UP_IMAGE_LIMIT)
)
const hasUsedFollowUpRetake = computed(() => detectUsedFollowUpRetake(result.value))
const canShowFollowUpUploader = computed(
  () => Boolean(result.value?.followUpRequired && result.value?.uiHints?.canUploadMoreImages)
)
const followUpUploadBlockedReason = computed(() => {
  if (!result.value?.followUpRequired) {
    return '当前轮没有开放补图。'
  }

  if (hasUsedFollowUpRetake.value) {
    return '本次会话的补图机会已使用，请继续答题或重新开始新的诊断。'
  }

  return '当前轮次没有开放补图入口，请优先回答问题。'
})
const isSubmittingAnyFollowUp = computed(() => Boolean(submittingFollowUpMode.value))
const isSubmittingFollowUpAnswer = computed(() => submittingFollowUpMode.value === 'answers')
const isSubmittingFollowUpImage = computed(() => submittingFollowUpMode.value === 'images')
const currentFollowUpQuestion = computed(() => {
  const items = Array.isArray(followUpQuestionStack.value) ? followUpQuestionStack.value : []
  return items[activeFollowUpQuestionIndex.value] || null
})
const hasDirtyFollowUpAnswers = computed(() => dirtyFollowUpFromIndex.value >= 0)
const currentFollowUpAccordionValue = computed({
  get() {
    const question = currentFollowUpQuestion.value
    if (!isAccordionFollowUpQuestion(question)) return ''
    return getExpandedFollowUpOptionId(question)
  },
  set(value) {
    const question = currentFollowUpQuestion.value
    if (!isAccordionFollowUpQuestion(question)) return
    const optionId = normalizeCollapseOptionValue(value)
    if (!optionId) return
    setExpandedFollowUpOption(question, optionId)
    setFollowUpAnswer(getFollowUpQuestionId(question), optionId)
  }
})

watch(
  currentFollowUpQuestion,
  async question => {
    if (!question) {
      followUpSwiperPages.value = [null, null]
      followUpSwiperCurrent.value = 0
      return
    }

    const activeIndex = followUpSwiperCurrent.value
    const activeQuestion = followUpSwiperPages.value[activeIndex]
    const questionId = getFollowUpQuestionId(question)

    if (!activeQuestion) {
      followUpSwiperPages.value = [question, null]
      followUpSwiperCurrent.value = 0
      return
    }

    if (getFollowUpQuestionId(activeQuestion) === questionId) {
      followUpSwiperPages.value = followUpSwiperPages.value.map((item, index) =>
        index === activeIndex ? question : item
      )
      return
    }

    const nextIndex = activeIndex === 0 ? 1 : 0
    followUpSwiperPages.value = followUpSwiperPages.value.map((item, index) =>
      index === nextIndex ? question : item
    )
    await nextTick()
    followUpSwiperCurrent.value = nextIndex
  },
  { immediate: true }
)
const actionAdviceTexts = computed(() => {
  const explanation = result.value?.explanation || result.value?.resultExplanation || {}
  const nextSteps = Array.isArray(result.value?.nextSteps)
    ? result.value.nextSteps.map(item => String(item?.text || '').trim()).filter(Boolean)
    : []
  const treatmentText = String(result.value?.treatmentText || explanation?.firstAid || '').trim()
  return uniqueStrings([...nextSteps, ...(treatmentText ? [treatmentText] : [])])
})
const avoidAdviceTexts = computed(() => {
  const explanation = result.value?.explanation || result.value?.resultExplanation || {}
  const whatToAvoid = Array.isArray(result.value?.whatToAvoid)
    ? result.value.whatToAvoid.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const preventionText = String(result.value?.preventionText || explanation?.avoid || '').trim()
  return uniqueStrings([...whatToAvoid, ...(preventionText ? [preventionText] : [])])
})
const popupHeight = computed(() => {
  const totalHeight = Number(viewportHeight.value || 0)
  const navbarHeight = Number(userStore.navbarHeight || 0)
  const bottomTabBarHeight = Number(tabBarOccupiedHeight.value || 0)
  if (!totalHeight) {
    return 640
  }
  return Math.max(420, totalHeight - navbarHeight - bottomTabBarHeight)
})
const popupPanelStyle = computed(() => ({
  height: `${popupHeight.value}px`
}))

function refreshViewportHeight() {
  try {
    const systemInfo = uni.getSystemInfoSync()
    viewportHeight.value = Math.max(
      Number(systemInfo?.screenHeight || 0),
      Number(systemInfo?.windowHeight || 0)
    )
    tabBarOccupiedHeight.value =
      50 +
      Math.max(
        Number(systemInfo?.safeAreaInsets?.bottom || 0),
        0
      )
  } catch {
    viewportHeight.value = 0
    tabBarOccupiedHeight.value = 50
  }
}

function isAccordionFollowUpQuestion(question) {
  return String(question?.uiVariant || '').trim() === 'single_select_accordion'
}

function getFollowUpQuestionId(question) {
  return String(question?.questionId || '').trim()
}

function getFollowUpOptionId(option) {
  return String(option?.optionId || '').trim()
}

function getExpandedFollowUpOptionId(question) {
  const questionId = getFollowUpQuestionId(question)
  if (!questionId) return ''
  return String(
    expandedFollowUpOptionByQuestion.value[questionId] ||
    followUpAnswers.value[questionId] ||
    question?.defaultOptionId ||
    ''
  ).trim()
}

function normalizeCollapseOptionValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeCollapseOptionValue(value.detail?.value ?? value.detail ?? value.value ?? '')
  }
  if (Array.isArray(value)) {
    return String(value[0] || '').trim()
  }
  return String(value || '').trim()
}

function setExpandedFollowUpOption(question, optionId) {
  const questionId = getFollowUpQuestionId(question)
  const normalizedOptionId = String(optionId || '').trim()
  if (!questionId || !normalizedOptionId) return
  expandedFollowUpOptionByQuestion.value = {
    ...expandedFollowUpOptionByQuestion.value,
    [questionId]: normalizedOptionId
  }
}

function handleFollowUpAccordionChange(question, value) {
  const optionId = normalizeCollapseOptionValue(value)
  if (!optionId) return
  setExpandedFollowUpOption(question, optionId)
  setFollowUpAnswer(getFollowUpQuestionId(question), optionId)
}

function isFollowUpOptionExpanded(question, option) {
  if (!isAccordionFollowUpQuestion(question)) return true
  const optionId = getFollowUpOptionId(option)
  return Boolean(optionId && getExpandedFollowUpOptionId(question) === optionId)
}

function isSelectedFollowUpOption(question, option) {
  const questionId = getFollowUpQuestionId(question)
  const optionId = getFollowUpOptionId(option)
  if (!questionId || !optionId) return false
  const selectedOptionId = String(
    followUpAnswers.value[questionId] ||
    question?.defaultOptionId ||
    ''
  ).trim()
  return selectedOptionId === optionId
}

function selectFollowUpOption(question, option) {
  const questionId = getFollowUpQuestionId(question)
  const optionId = getFollowUpOptionId(option)
  if (!questionId || !optionId) return
  setFollowUpAnswer(questionId, optionId)
  if (isAccordionFollowUpQuestion(question)) {
    setExpandedFollowUpOption(question, optionId)
  }
}

function findFollowUpQuestionIndex(questionId = '') {
  const normalizedQuestionId = String(questionId || '').trim()
  if (!normalizedQuestionId) return -1
  return followUpQuestionStack.value.findIndex(item => getFollowUpQuestionId(item) === normalizedQuestionId)
}

function updateDirtyFollowUpIndex(questionId = '', optionId = '') {
  const questionIndex = findFollowUpQuestionIndex(questionId)
  if (questionIndex < 0) return

  const committedOptionId = String(
    committedFollowUpAnswers.value?.[questionId]?.optionId || ''
  ).trim()
  const isHistoricalQuestion = questionIndex < followUpQuestionStack.value.length - 1

  if (committedOptionId && committedOptionId === String(optionId || '').trim()) {
    return
  }

  if (!committedOptionId && !isHistoricalQuestion) {
    return
  }

  dirtyFollowUpFromIndex.value =
    dirtyFollowUpFromIndex.value >= 0
      ? Math.min(dirtyFollowUpFromIndex.value, questionIndex)
      : questionIndex
}

function goPreviousFollowUpQuestion() {
  activeFollowUpQuestionIndex.value = Math.max(0, activeFollowUpQuestionIndex.value - 1)
}

function goNextFollowUpQuestion() {
  if (hasDirtyFollowUpAnswers.value && activeFollowUpQuestionIndex.value >= dirtyFollowUpFromIndex.value) {
    return
  }
  activeFollowUpQuestionIndex.value = Math.min(
    Math.max(followUpQuestionStack.value.length - 1, 0),
    activeFollowUpQuestionIndex.value + 1
  )
}

function canProceedFollowUpQuestion() {
  const question = currentFollowUpQuestion.value
  const questionId = getFollowUpQuestionId(question)
  if (!questionId) return false
  if (isSubmittingAnyFollowUp.value) return false
  if (followUpImageFiles.value.length > 0 || hasPendingFollowUpUploads.value || hasFollowUpUploadErrors.value) {
    return false
  }
  return Boolean(followUpAnswers.value[questionId])
}

async function handleNextFollowUpQuestion() {
  if (!canProceedFollowUpQuestion()) {
    return
  }

  if (!hasDirtyFollowUpAnswers.value && activeFollowUpQuestionIndex.value < followUpQuestionStack.value.length - 1) {
    goNextFollowUpQuestion()
    return
  }

  await submitFollowUps()
}

function resetFollowUpQuestionState(followUps = [], { answerRevision = 0 } = {}) {
  const nextFollowUps = Array.isArray(followUps) ? followUps.filter(item => item?.questionId) : []
  followUpQuestionStack.value = nextFollowUps
  activeFollowUpQuestionIndex.value = 0
  followUpAnswers.value = createFollowUpAnswerMap(nextFollowUps)
  committedFollowUpAnswers.value = {}
  dirtyFollowUpFromIndex.value = -1
  followUpAnswerRevision.value = Number(answerRevision || 0)
  expandedFollowUpOptionByQuestion.value = {}
}

function mergeFollowUpQuestionState(nextResult = null, submittedPayload = null) {
  const nextFollowUps = Array.isArray(nextResult?.followUps)
    ? nextResult.followUps.filter(item => item?.questionId)
    : []
  const submittedAnswers = Array.isArray(submittedPayload?.answers) ? submittedPayload.answers : []
  const submittedAnswerMap = submittedAnswers.reduce((entries, item) => {
    const questionId = String(item?.questionId || '').trim()
    const optionId = String(item?.optionId || '').trim()
    if (questionId && optionId) {
      entries[questionId] = {
        optionId,
        answerRevision: Number(nextResult?.answerRevision || submittedPayload?.baseAnswerRevision || 0)
      }
    }
    return entries
  }, {})

  const dirtyIndex = dirtyFollowUpFromIndex.value
  const patchKeepUntilQuestionId = String(nextResult?.uiPatch?.keepUntilQuestionId || '').trim()
  const patchKeepIndex = patchKeepUntilQuestionId
    ? findFollowUpQuestionIndex(patchKeepUntilQuestionId)
    : -1
  const keepEndIndex =
    patchKeepIndex >= 0
      ? patchKeepIndex
      : dirtyIndex >= 0
        ? dirtyIndex
        : followUpQuestionStack.value.length - 1
  const keptQuestions = followUpQuestionStack.value.slice(0, Math.max(0, keepEndIndex + 1))
  const keptQuestionIds = new Set(keptQuestions.map(item => getFollowUpQuestionId(item)).filter(Boolean))
  const appendQuestions = nextFollowUps.filter(item => !keptQuestionIds.has(getFollowUpQuestionId(item)))
  const nextStack = nextResult?.followUpRequired ? [...keptQuestions, ...appendQuestions] : []
  const nextStackQuestionIds = new Set(nextStack.map(item => getFollowUpQuestionId(item)).filter(Boolean))

  followUpQuestionStack.value = nextStack
  followUpAnswers.value = {
    ...Object.fromEntries(
      Object.entries(followUpAnswers.value || {}).filter(([questionId]) =>
        nextStackQuestionIds.has(questionId)
      )
    ),
    ...createFollowUpAnswerMap(appendQuestions)
  }
  committedFollowUpAnswers.value = {
    ...Object.fromEntries(
      Object.entries(committedFollowUpAnswers.value || {}).filter(([questionId]) =>
        nextStackQuestionIds.has(questionId)
      )
    ),
    ...Object.fromEntries(
      Object.entries(submittedAnswerMap).filter(([questionId]) => nextStackQuestionIds.has(questionId))
    )
  }
  dirtyFollowUpFromIndex.value = -1
  followUpAnswerRevision.value = Number(nextResult?.answerRevision || followUpAnswerRevision.value || 0)
  activeFollowUpQuestionIndex.value = nextStack.length ? nextStack.length - 1 : 0
  expandedFollowUpOptionByQuestion.value = {}
}

onMounted(() => {
  refreshViewportHeight()
})

function open() {
  refreshViewportHeight()
  popup.value?.open()
}

function close() {
  popup.value?.close()
}

function handleChange(e) {
  if (!e.show) {
    emit('close')
  }
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function handleDevSymptomClassChange(event) {
  const index = Number(event?.detail?.value ?? 0)
  const nextOption = devVisualSymptomClassPickerOptions.value[index] || devVisualSymptomClassPickerOptions.value[0]
  selectedDevSymptomClassKey.value = String(nextOption?.classKey || '').trim()
}

function clearDevSymptomClass() {
  selectedDevSymptomClassKey.value = ''
}

function buildDevVisualObservedSymptoms() {
  const option = selectedDevSymptomClassOption.value
  if (!automationEnabled || !option) return []

  return [
    {
      symptomKey: option.symptomKey,
      symptomCn: option.symptomCn,
      confidence: 0.99,
      source: 'visual_admitted',
      evidenceSource: 'visual_admitted',
      classKey: option.classKey,
      classNameCn: option.classNameCn
    }
  ]
}

function buildDevVisualObservedEvidenceSet() {
  const option = selectedDevSymptomClassOption.value
  if (!automationEnabled || !option) return []

  return [
    {
      observedEvidenceSetId: `dev_visual::${option.classKey}::${option.symptomKey}`,
      evidenceKey: option.symptomKey,
      evidenceType: 'symptom',
      symptomKey: option.symptomKey,
      symptomCn: option.symptomCn,
      confidence: 0.99,
      sourceType: 'visual_admitted',
      currentStatus: 'active',
      targetLayer: 'observed_evidence_set',
      sourceRecordId: option.classKey,
      firstSeenStage: 'visual_precheck',
      enteredRuntime: 1,
      enteredExplanation: 1,
      isKeyEvidence: 1,
      visualStructuralEvidenceStatus: 'present',
      visualSupportOrgans: ['leaf'],
      visualSupportCount: 1,
      visualSupportingRegionNote: `开发环境模拟：${option.classNameCn}`,
      visualConfidenceBand: 'high',
      visualStrengthLevel: 'strong',
      visualAdmissionReason: 'development-only symptom class simulator'
    }
  ]
}

function buildStructuredImageInputs(files = []) {
  return (Array.isArray(files) ? files : [])
    .filter(item => item?.status === 'success')
    .map((item, index) => {
      const imageRef = String(item?.uploaded?.tempUrl || item?.uploaded?.url || '').trim()
      if (!imageRef) {
        return null
      }

      const slotType = normalizeSlotType(item?.inputSlotType || item?.userDeclaredOrganType || '', 'unknown')
      const metadata = buildSlotMetadata(slotType, index)
      const uploadCompression = buildUploadCompressionTrace(item)
      const declaredConfidence =
        item?.userDeclaredOrganConfidence === null ||
        item?.userDeclaredOrganConfidence === undefined ||
        item?.userDeclaredOrganConfidence === ''
          ? metadata.userDeclaredOrganConfidence
          : Number(item.userDeclaredOrganConfidence)

      return {
        imageRef,
        inputSlotType: slotType,
        orderIndex: index,
        inputSlotOrder: index,
        inputSlotLabel: metadata.inputSlotLabel,
        userDeclaredOrganType: String(
          item?.userDeclaredOrganType || metadata.userDeclaredOrganType || ''
        ).trim(),
        userDeclaredOrganConfidence:
          declaredConfidence === null || declaredConfidence === undefined || Number.isNaN(declaredConfidence)
            ? null
            : Number(declaredConfidence),
        ...(uploadCompression ? { uploadCompression } : {}),
        ...(item?.uploaded?.fileId ? { fileId: item.uploaded.fileId } : {})
      }
    })
    .filter(Boolean)
}

function normalizePositiveNumber(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function buildUploadCompressionTrace(item = {}) {
  const compression = item?.compressed || null
  if (!compression || typeof compression !== 'object') {
    return null
  }

  const originalSizeBytes = normalizePositiveNumber(compression.originalSize || item?.size)
  const uploadedSizeBytes = normalizePositiveNumber(compression.fileSize)
  const quality = normalizePositiveNumber(compression.quality)
  const width = normalizePositiveNumber(compression.width)
  const height = normalizePositiveNumber(compression.height)
  const targetSizeBytes = normalizePositiveNumber(compression.targetBytes)
  const minimumQuality = normalizePositiveNumber(compression.minimumQuality)

  return {
    source: 'client_upload_before_cloud_storage',
    compressed: Boolean(compression.compressed),
    originalSizeBytes,
    uploadedSizeBytes,
    compressionRatio:
      originalSizeBytes > 0 && uploadedSizeBytes > 0
        ? Math.round((uploadedSizeBytes / originalSizeBytes) * 1000) / 1000
        : null,
    quality: quality || null,
    width: width || null,
    height: height || null,
    targetSizeBytes: targetSizeBytes || null,
    minimumQuality: minimumQuality || null,
    preserveImageDetails: Boolean(compression.preserveImageDetails),
    doubleConfirmedForHunyuan: Boolean(item?.uploaded?.tempUrl || item?.uploaded?.url)
  }
}

function getPreviewImagesFromFiles(files = []) {
  return uniqueStrings(
    (Array.isArray(files) ? files : []).map(item => item?.previewUrl)
  )
}

function getCasePreviewImages({ includeFollowUp = false } = {}) {
  const baseImages = casePreviewImages.value.length
    ? casePreviewImages.value
    : getPreviewImagesFromFiles(imageFiles.value)

  if (!includeFollowUp) {
    return uniqueStrings(baseImages)
  }

  return uniqueStrings([...baseImages, ...getPreviewImagesFromFiles(followUpImageFiles.value)])
}

function detectUsedFollowUpRetake(currentResult = null) {
  const trace = currentResult?.visualBatchTrace
  if (!trace || typeof trace !== 'object') {
    return false
  }

  const currentBatchId = String(trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || '').trim()
  const originBatchId = String(trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || '').trim()
  const supersedeApplied = Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) === 1

  return supersedeApplied || Boolean(currentBatchId && originBatchId && currentBatchId !== originBatchId)
}

async function chooseImage(slotType = 'other') {
  const normalizedSlotType = normalizeSlotType(slotType, 'other')
  const slotLimit = getSlotCapacity(PRIMARY_IMAGE_LIMIT)
  if (imageFiles.value.length >= PRIMARY_IMAGE_LIMIT) {
    uni.showToast({ title: `最多上传 ${PRIMARY_IMAGE_LIMIT} 张`, icon: 'none' })
    return
  }
  if (getSlotFileCount(imageFiles.value, normalizedSlotType) >= slotLimit) {
    uni.showToast({
      title: `${getOrganOptionLabel(normalizedSlotType)}最多 ${slotLimit} 张`,
      icon: 'none'
    })
    return
  }

  try {
    await uploader.chooseAndUpload({
      plantId: props.plantId,
      maxAge: 7200,
      pickCount: 1,
      entryPatch: buildSlotMetadata(normalizedSlotType, imageFiles.value.length)
    })
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (message.includes('cancel')) {
      return
    }

    console.error('选择图片失败:', error)
    uni.showToast({
      title: '选择图片失败，请重试',
      icon: 'none'
    })
  }
}

async function chooseFollowUpImage(slotType = 'whole_plant') {
  const normalizedSlotType = normalizeSlotType(slotType, 'whole_plant')
  const slotLimit = getSlotCapacity(FOLLOW_UP_IMAGE_LIMIT)
  if (followUpImageFiles.value.length >= FOLLOW_UP_IMAGE_LIMIT) {
    uni.showToast({ title: `最多补 ${FOLLOW_UP_IMAGE_LIMIT} 张`, icon: 'none' })
    return
  }
  if (getSlotFileCount(followUpImageFiles.value, normalizedSlotType) >= slotLimit) {
    uni.showToast({
      title: `${getOrganOptionLabel(normalizedSlotType)}最多 ${slotLimit} 张`,
      icon: 'none'
    })
    return
  }

  try {
    await followUpUploader.chooseAndUpload({
      plantId: props.plantId,
      maxAge: 7200,
      pickCount: 1,
      entryPatch: buildSlotMetadata(normalizedSlotType, followUpImageFiles.value.length)
    })
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (message.includes('cancel')) {
      return
    }

    console.error('选择补图失败:', error)
    uni.showToast({
      title: '选择补图失败，请重试',
      icon: 'none'
    })
  }
}

function removeImage(index) {
  uploader.removeAt(index)
}

function removeFollowUpImage(index) {
  followUpUploader.removeAt(index)
}

async function resetFollowUpUploads() {
  await followUpUploader.reset()
}

async function startDiagnose() {
  const devObservedSymptoms = buildDevVisualObservedSymptoms()
  const devObservedEvidenceSet = buildDevVisualObservedEvidenceSet()
  const propObservedSymptoms = Array.isArray(props.observedSymptoms) ? props.observedSymptoms : []
  const effectiveObservedSymptoms = devObservedSymptoms.length ? devObservedSymptoms : propObservedSymptoms
  const effectiveObservedEvidenceSet = devObservedEvidenceSet.length ? devObservedEvidenceSet : []
  const hasObservedSymptoms = effectiveObservedSymptoms.length > 0
  const structuredImages = primaryStructuredImages.value
  const uploadedImageUrls = structuredImages.map(item => item.imageRef)

  if (imageFiles.value.length === 0 && !hasObservedSymptoms) {
    uni.showToast({ title: '请先添加照片', icon: 'none' })
    return
  }

  if (hasPendingUploads.value) {
    uni.showToast({ title: '请等待图片上传完成', icon: 'none' })
    return
  }

  if (hasUploadErrors.value) {
    uni.showToast({ title: '请先删除上传失败的图片', icon: 'none' })
    return
  }

  if (uploadedImageUrls.length === 0 && !hasObservedSymptoms) {
    uni.showToast({ title: '请至少保留 1 张上传成功的图片', icon: 'none' })
    return
  }

  if (!userStore.canDiagnose) {
    uni.showModal({
      title: '提示',
      content: '免费诊断次数已用完，升级会员享受无限次诊断',
      confirmText: '升级会员',
      success: res => {
        if (res.confirm) {
          close()
          uni.switchTab({ url: '/pages/profile/profile' })
        }
      }
    })
    return
  }

  try {
    const imageUrls = hasObservedSymptoms ? [] : uploadedImageUrls

    const diagnosePayload = {
      image: imageUrls[0] || '',
      images: hasObservedSymptoms ? [] : structuredImages,
      imageIds: imageUrls,
      plantId: props.plantId,
      plantName: props.plantName,
      observedSymptoms: hasObservedSymptoms ? effectiveObservedSymptoms : [],
      observedEvidenceSet: effectiveObservedEvidenceSet,
      description: hasDevVisualEvidence.value
        ? `开发调试模拟视觉证据：${selectedDevSymptomClassOption.value.symptomCn}（${selectedDevSymptomClassOption.value.classNameCn}）`
        : `共上传 ${imageUrls.length} 张照片`
    }

    pendingDiagnosePayload.value = diagnosePayload
    showAIDialog.value = true
    await new Promise(resolve => setTimeout(resolve, 100))
    aiStreamDialogRef.value?.startStream()

    await diagnoseMutation.mutateAsync({
      ...diagnosePayload,
      onText: (text, fullText) => {
        aiStreamDialogRef.value?.setText(fullText)
      },
      onFinish: diagnosisResult => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
        userStore.useAIQuota()
      },
      onError: error => {
        aiStreamDialogRef.value?.setError(error)
      }
    })
  } catch (error) {
    console.error('诊断失败:', error)
    uni.hideLoading()
    uni.showToast({ title: error?.message || '诊断失败，请重试', icon: 'none' })
  }
}

function handleAIDialogClose() {
  showAIDialog.value = false
}

function buildDiagnosisFollowUpStorageKey(diagnosisSessionId = '') {
  return `${DIAGNOSIS_FOLLOW_UP_STORAGE_KEY_PREFIX}${diagnosisSessionId || Date.now()}`
}

function navigateToDiagnosisFollowUpPage(diagnosisResult) {
  const previewImages = getCasePreviewImages({ includeFollowUp: false })
  const normalizedResult = normalizeDiagnosisResult(diagnosisResult, {
    images: previewImages,
    plantName: props.plantName || '植物'
  })
  const storageKey = buildDiagnosisFollowUpStorageKey(normalizedResult.diagnosisSessionId)

  uni.setStorageSync(storageKey, {
    plantId: props.plantId,
    plantName: props.plantName || '植物',
    images: previewImages,
    diagnosisResult,
    normalizedResult,
    createdAt: Date.now()
  })

  showAIDialog.value = false
  pendingDiagnosePayload.value = null
  close()
  uni.navigateTo({
    url: `/pages/diagnose/follow-up?draftKey=${encodeURIComponent(storageKey)}`
  })
}

function handleAIDialogCancel() {
  showAIDialog.value = false
  pendingDiagnosePayload.value = null
  close()
}

function handleAIDialogConfirm(diagnosisResult) {
  if (diagnosisResult) {
    navigateToDiagnosisFollowUpPage(diagnosisResult)
    return
  }
  showAIDialog.value = false
}

function handleAIRetry() {
  if (pendingDiagnosePayload.value) {
    aiStreamDialogRef.value?.startStream()

    const callbackOpts = {
      ...pendingDiagnosePayload.value,
      onText: (text, fullText) => {
        aiStreamDialogRef.value?.setText(fullText)
      },
      onFinish: diagnosisResult => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
      },
      onError: error => {
        aiStreamDialogRef.value?.setError(error)
      }
    }

    diagnoseMutation.mutateAsync(callbackOpts)
  }
}

function setFollowUpAnswer(questionId, answerValue) {
  updateDirtyFollowUpIndex(questionId, answerValue)
  followUpAnswers.value = {
    ...followUpAnswers.value,
    [questionId]: answerValue
  }
}

function canStartDiagnose() {
  const hasObservedSymptoms =
    hasDevVisualEvidence.value ||
    (Array.isArray(props.observedSymptoms) && props.observedSymptoms.length > 0)

  if (!hasObservedSymptoms && primaryStructuredImages.value.length === 0) {
    return false
  }

  if (hasUploadErrors.value) {
    return false
  }

  return !hasPendingUploads.value
}

function canSubmitFollowUps() {
  if (followUpImageFiles.value.length > 0 || hasPendingFollowUpUploads.value || hasFollowUpUploadErrors.value) {
    return false
  }

  if (!hasDirtyFollowUpAnswers.value && activeFollowUpQuestionIndex.value < followUpQuestionStack.value.length - 1) {
    return false
  }

  return isFollowUpAnswerComplete(
    followUpQuestionStack.value.slice(0, activeFollowUpQuestionIndex.value + 1),
    followUpAnswers.value
  )
}

function canSubmitFollowUpImages() {
  if (!canShowFollowUpUploader.value) {
    return false
  }

  if (hasUsedFollowUpRetake.value) {
    return false
  }

  if (hasPendingFollowUpUploads.value || hasFollowUpUploadErrors.value) {
    return false
  }

  return followUpStructuredImages.value.length > 0
}

async function submitFollowUps() {
  if (!result.value || !canSubmitFollowUps()) {
    return
  }

  submittingFollowUpMode.value = 'answers'
  try {
    const isRevisionSubmit = hasDirtyFollowUpAnswers.value
    const submitQuestionStack = isRevisionSubmit
      ? followUpQuestionStack.value.slice(0, activeFollowUpQuestionIndex.value + 1)
      : currentFollowUpQuestion.value
        ? [currentFollowUpQuestion.value]
        : []
    const payload = buildFollowUpPayload(result.value, followUpAnswers.value, {
      questionStack: submitQuestionStack,
      requestMode: isRevisionSubmit ? 'answer_revision' : 'answer_submit',
      baseAnswerRevision: followUpAnswerRevision.value,
      dirtyFromQuestionId:
        dirtyFollowUpFromIndex.value >= 0
          ? getFollowUpQuestionId(followUpQuestionStack.value[dirtyFollowUpFromIndex.value])
          : ''
    })
    const rerunResult = await followUpMutation.mutateAsync({
      diagnosisSessionId: payload.diagnosisSessionId,
      roundId: payload.roundId,
      answers: payload.answers,
      requestMode: payload.requestMode,
      baseAnswerRevision: payload.baseAnswerRevision,
      dirtyFromQuestionId: payload.dirtyFromQuestionId
    })

    const previewImages = getCasePreviewImages({ includeFollowUp: false })
    casePreviewImages.value = previewImages
    result.value = normalizeDiagnosisResult(rerunResult, {
      images: previewImages,
      plantName: props.plantName || result.value.plantName || '植物'
    })
    mergeFollowUpQuestionState(result.value, payload)

    diagnoseStore.addToHistory({
      images: previewImages,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisSessionId || ''
    })
    emit('success', result.value)

    uni.showToast({
      title: result.value.followUpRequired ? '问诊已更新' : '诊断已收敛',
      icon: 'success'
    })
  } catch (error) {
    console.error('问诊处理失败:', error)
    uni.showToast({ title: error.message || '问诊失败，请重试', icon: 'none' })
  } finally {
    submittingFollowUpMode.value = ''
  }
}

async function submitFollowUpImages() {
  if (!result.value || !canSubmitFollowUpImages()) {
    return
  }

  submittingFollowUpMode.value = 'images'
  try {
    const structuredImages = followUpStructuredImages.value
    const imageIds = structuredImages.map(item => item.imageRef).filter(Boolean)
    const rerunResult = await followUpMutation.mutateAsync({
      diagnosisSessionId: result.value.diagnosisSessionId,
      roundId: result.value.roundId,
      image: imageIds[0] || '',
      images: structuredImages,
      imageIds,
      latestVisualCallBatchId: result.value.latestVisualCallBatchId,
      visualBatchTrace: result.value.visualBatchTrace
    })

    const nextPreviewImages = getCasePreviewImages({ includeFollowUp: true })
    casePreviewImages.value = nextPreviewImages
    result.value = normalizeDiagnosisResult(rerunResult, {
      images: nextPreviewImages,
      plantName: props.plantName || result.value.plantName || '植物'
    })
    resetFollowUpQuestionState(result.value.followUps, {
      answerRevision: result.value.answerRevision
    })

    diagnoseStore.addToHistory({
      images: nextPreviewImages,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisSessionId || ''
    })
    emit('success', result.value)
    await followUpUploader.reset()

    uni.showToast({
      title: result.value.followUpRequired ? '补图已更新' : '补图诊断已完成',
      icon: 'success'
    })
  } catch (error) {
    console.error('提交补图失败:', error)
    uni.showToast({ title: error.message || '补图失败，请重试', icon: 'none' })
  } finally {
    submittingFollowUpMode.value = ''
  }
}

async function resetDiagnose() {
  await Promise.all([uploader.reset(), followUpUploader.reset()])
  result.value = null
  pendingDiagnosePayload.value = null
  casePreviewImages.value = []
  followUpAnswers.value = {}
  followUpQuestionStack.value = []
  activeFollowUpQuestionIndex.value = 0
  committedFollowUpAnswers.value = {}
  dirtyFollowUpFromIndex.value = -1
  followUpAnswerRevision.value = 0
  expandedFollowUpOptionByQuestion.value = {}
  submittingFollowUpMode.value = ''
}

function parseAutomationDiagnosePayload(rawInput = {}) {
  if (typeof rawInput !== 'string') {
    return rawInput && typeof rawInput === 'object' ? rawInput : {}
  }

  const trimmed = rawInput.trim()
  if (!trimmed) {
    return {}
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return { imageRef: trimmed }
  }
}

function buildAutomationDiagnoseImageEntry(rawInput = {}, index = 0) {
  const item = parseAutomationDiagnosePayload(rawInput)
  const imageRef = String(item?.imageRef || item?.imageUrl || item?.url || item?.image || '').trim()

  if (!imageRef) {
    return null
  }

  const slotType = normalizeSlotType(
    item?.inputSlotType || item?.slotType || item?.userDeclaredOrganType || 'leaf',
    'leaf'
  )
  const slotMetadata = buildSlotMetadata(slotType, index)
  const uploadedSizeBytes = Number(item?.uploadedSizeBytes || item?.size || 0)
  const originalSizeBytes = Number(item?.originalSizeBytes || item?.size || 0)

  return {
    id: `automation_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    localPath: imageRef,
    previewUrl: imageRef,
    ext: String(item?.ext || item?.suffix || 'jpg').replace(/^\./, '') || 'jpg',
    size: Number.isFinite(originalSizeBytes) && originalSizeBytes > 0 ? originalSizeBytes : 0,
    status: 'success',
    loading: false,
    error: '',
    uploaded: {
      tempUrl: imageRef,
      url: imageRef,
      fileId: String(item?.fileId || imageRef)
    },
    compressed: {
      originalSize: Number.isFinite(originalSizeBytes) && originalSizeBytes > 0 ? originalSizeBytes : 0,
      fileSize: Number.isFinite(uploadedSizeBytes) && uploadedSizeBytes > 0 ? uploadedSizeBytes : 0,
      compressed: Boolean(item?.compressed),
      quality: Number(item?.quality || 100),
      width: Number(item?.width || 0),
      height: Number(item?.height || 0),
      targetBytes: Number(item?.targetSizeBytes || 0),
      minimumQuality: Number(item?.minimumQuality || 0),
      preserveImageDetails: true
    },
    ...slotMetadata,
    orderIndex: index,
    inputSlotOrder: index
  }
}

function injectAutomationDiagnoseImages(rawInput = {}) {
  const payload = parseAutomationDiagnosePayload(rawInput)
  const rawImages = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.images)
      ? payload.images
      : [payload]
  const entries = rawImages
    .slice(0, PRIMARY_IMAGE_LIMIT)
    .map((item, index) => buildAutomationDiagnoseImageEntry(item, index))
    .filter(Boolean)

  if (!entries.length) {
    throw new Error('缺少可注入的诊断图片')
  }

  imageFiles.value.splice(0, imageFiles.value.length, ...entries)
  pendingDiagnosePayload.value = null
  result.value = null

  return {
    count: entries.length,
    images: entries.map(item => ({
      imageRef: item.uploaded?.tempUrl || item.uploaded?.url || '',
      inputSlotType: item.inputSlotType,
      inputSlotLabel: item.inputSlotLabel
    }))
  }
}

function injectAutomationDiagnoseImagesFromStorage() {
  if (!automationEnabled) {
    return { count: 0, images: [] }
  }

  const payload = uni.getStorageSync(AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY)
  return injectAutomationDiagnoseImages(payload)
}

defineExpose({
  injectAutomationDiagnoseImages,
  open,
  close
})
</script>

<style scoped>
.dev-visual-evidence-panel {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #b7dcc5;
  border-radius: 16px;
  background: linear-gradient(135deg, #f3faf5 0%, #fffdf8 100%);
}

.dev-visual-evidence-tag {
  flex-shrink: 0;
  padding: 3px 7px;
  border-radius: 999px;
  background: #d8f3dc;
  color: #1f5a42;
  font-size: 10px;
  font-weight: 700;
}

.dev-visual-evidence-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(45, 106, 79, 0.16);
  border-radius: 14px;
  background: #ffffff;
}

.dev-visual-evidence-picker-action {
  flex-shrink: 0;
  color: #2d6a4f;
  font-size: 11px;
  font-weight: 700;
}

.dev-visual-evidence-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(216, 243, 220, 0.62);
}

.dev-visual-evidence-clear {
  flex-shrink: 0;
  color: #8b7355;
  font-size: 10px;
  font-weight: 700;
}

.followup-nav-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.followup-nav-button {
  flex: 1;
  height: 36px;
  padding: 0;
  border: 1px solid #b7dcc5;
  border-radius: 12px;
  background: #ffffff;
  color: #2d6a4f;
  font-size: 12px;
  font-weight: 700;
  line-height: 36px;
}

.followup-nav-button--disabled {
  opacity: 0.45;
}

.popup-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.diagnose-automation-trigger {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  z-index: -1;
}

.popup-content-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.popup-scroll {
  height: 100%;
}

.popup-footer {
  flex-shrink: 0;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px);
  border-top: 1px solid #f1f5f9;
  background: rgba(255, 255, 255, 0.98);
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.slot-card {
  border-radius: 16px;
  padding: 10px;
}

.slot-thumb-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.followup-swiper {
  width: 100%;
  height: 340px;
  overflow-x: hidden;
  overflow-y: visible;
}

.followup-swiper-item {
  overflow-x: hidden;
  overflow-y: visible;
}

.followup-swiper :deep(.uni-swiper-wrapper),
.followup-swiper :deep(.uni-swiper-slides),
.followup-swiper :deep(.uni-swiper-slide-frame) {
  overflow-x: hidden !important;
  overflow-y: visible !important;
}

.followup-question-card {
  min-height: 180px;
  border-radius: 16px;
  padding: 12px;
  background: #fff;
  border: 1px solid #d8f3dc;
  overflow: visible;
}

.followup-question-card--animated {
  animation: followup-card-enter 260ms ease-out both;
}

.followup-option-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}

.followup-option-stack--accordion {
  gap: 10px;
}

.followup-option-collapse {
  width: 100%;
  overflow: visible;
  border-radius: 20rpx;
  background: transparent;
}

.followup-option-collapse-item {
  margin-bottom: 16rpx;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 20rpx;
  background: #ffffff;
}

.followup-option-accordion-title {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 22rpx 24rpx;
}

.followup-option-accordion-title--active {
  color: #ffffff;
  background: #2d6a4f;
}

.followup-option-accordion-title--idle {
  color: #374151;
  background: #ffffff;
}

.followup-option-accordion-text {
  flex: 1;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
  word-break: break-word;
}

.followup-option-accordion-badge {
  flex-shrink: 0;
  padding: 4rpx 12rpx;
  border: 1px solid currentColor;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.35;
  opacity: 0.9;
}

.followup-option-collapse-body {
  padding: 0 24rpx 22rpx;
  background: #ffffff;
}

.followup-option-collapse-body--active {
  background: #eaf6ef;
}

.followup-option-button {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-start;
  margin: 0;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 14px;
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}

.followup-option-stack--accordion .followup-option-button {
  min-height: 58px;
  padding: 11px 12px;
}

.followup-option-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.followup-option-text {
  display: block;
  width: 100%;
  font-weight: 600;
  text-align: left;
  white-space: normal;
  word-break: break-word;
}

.followup-option-description {
  display: block;
  width: 100%;
  font-size: 10px;
  line-height: 1.45;
  text-align: left;
  white-space: pre-line;
  word-break: break-word;
  opacity: 0.82;
}

.followup-option-stack--accordion .followup-option-description {
  margin-top: 2px;
}

.followup-option-button--active {
  color: #fff;
  background: #2d6a4f;
}

.followup-option-button--idle {
  color: #374151;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.whitespace-pre-line {
  white-space: pre-line;
}

.upload-spinner {
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: 2px solid rgba(45, 106, 79, 0.2);
  border-top-color: #2d6a4f;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes followup-card-enter {
  from {
    opacity: 0;
    transform: translate3d(18rpx, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}
.followup-option-title-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
</style>
