<template>
  <view
    id="diagnose-flow"
    class="diagnose-flow-root flex flex-col"
    :class="{ 'diagnose-flow-root--intake': !result }"
  >
    <view
      v-if="automationEnabled"
      id="diagnose-automation-inject-button"
      class="diagnose-automation-trigger"
      @click="injectAutomationDiagnoseImagesFromStorage"
    />
    <view
      id="diagnose-flow-content"
      class="flex-1 min-h-0"
      :class="{
        'px-4': contentPadding,
        'pt-4': embedded || result,
        'diagnose-flow-content--intake': !embedded && !result,
        'diagnose-flow-content--with-sticky-footer': !embedded && !result
      }"
    >
      <DiagnoseIntake v-if="!result" :view="viewContext" />
      <scroll-view v-if="result" id="diagnose-flow-result-scroll" scroll-y class="h-full min-h-0">
        <QuestionPackageResult :result="result">
          <template #after-conclusion>
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
          </template>
          <template #after-avoid>
            <DiagnoseQuestionPackageSection :view="viewContext" />
          </template>
        </QuestionPackageResult>
      </scroll-view>
    </view>
    <view
      id="diagnose-flow-footer"
      class="diagnose-flow-footer border-t border-[#E5E7EB] bg-white px-4 py-4"
      :class="{ 'diagnose-flow-footer--sticky': !embedded && !result }"
    >
      <view v-if="!result" id="diagnose-flow-footer-start">
        <view
          v-if="!isVisualScanning && imageFiles.length"
          id="diagnose-uploaded-image-list"
          class="diagnose-uploaded-image-list"
        >
          <view
            v-for="(item, index) in imageFiles"
            :key="item.id || index"
            :id="`diagnose-preview-image-${index}-button`"
            class="diagnose-uploaded-image"
            @click="previewUploadedImage(item)"
          >
            <image :src="item.previewUrl" class="h-full w-full" mode="aspectFill" />
            <view class="diagnose-uploaded-image-label">
              <text>{{ getUploadedImageLabel(item) }}</text>
            </view>
            <view v-if="item.loading" class="diagnose-uploaded-image-status">
              <text>上传中</text>
            </view>
            <view
              v-else-if="item.status === 'error'"
              class="diagnose-uploaded-image-status diagnose-uploaded-image-status--error"
            >
              <text>{{ item.error || '上传失败' }}</text>
            </view>
          </view>
        </view>
        <button
          id="diagnose-submit-button"
          class="h-12 w-full rounded-xl bg-primary px-0 py-0 text-base font-medium leading-6 text-white after:border-0"
          :class="{ 'opacity-70': !canStartCurrentIntake }"
          :disabled="!canStartCurrentIntake"
          @click="startDiagnose"
        >
          <view class="diagnose-submit-button-label">
            {{ isVisualScanning ? '扫描中…' : '开始诊断' }}
          </view>
        </button>
      </view>
      <view v-else-if="retakeExpired" id="diagnose-flow-footer-expired-actions">
        <button
          id="diagnose-retake-expired-reset-button"
          class="w-full rounded-xl border border-primary bg-white py-2.5 text-sm font-semibold text-primary"
          @click="resetDiagnose"
        >
          重新诊断
        </button>
      </view>
      <view v-else id="diagnose-flow-footer-result-actions" class="space-y-3">
        <button
          v-if="canShowAdditionalImageUploader"
          id="diagnose-question-package-image-submit-button"
          class="w-full rounded-xl bg-[#2D6A4F] py-2.5 text-sm text-white"
          :class="{ 'opacity-50': isSubmittingQuestionFlow || !canSubmitAdditionalImagesNow }"
          :disabled="isSubmittingQuestionFlow || !canSubmitAdditionalImagesNow"
          @click="submitAdditionalImages"
        >
          {{ isSubmittingAdditionalImage ? '补图诊断中...' : '提交补图并重新诊断' }}
        </button>
        <button
          id="diagnose-reset-button"
          class="h-8 w-full bg-transparent py-0 text-[12px] font-semibold leading-8 text-[#2d7a4f] after:border-0"
          @click="resetDiagnose"
        >
          重新诊断
        </button>
        <button
          id="diagnose-finish-button"
          class="h-12 w-full rounded-xl bg-[#2d7a4f] py-0 text-[15px] font-bold leading-12 text-white after:border-0"
          @click="finishFlow"
        >
          返回首页
        </button>
      </view>
    </view>
  </view>
</template>

<script>
import { computed, watch } from 'vue'
import DiagnoseIntake from '@/components/diagnosis/DiagnoseIntake.vue'
import DirectionChoiceCard from './DirectionChoiceCard.vue'
import DiagnoseQuestionPackageSection from './DiagnoseQuestionPackageSection.vue'
import QuestionPackageResult from '../question-package/QuestionPackageResult.vue'
import RetakeCard from './RetakeCard.vue'
import { setupDiagnoseFlowState } from './setup.js'
import { previewDiagnosisImage } from '@/utils/diagnosis-image-preview.js'

function setupDiagnoseFlow(props, context) {
  const state = setupDiagnoseFlowState(props, context)
  watch(
    () => Boolean(state.result?.value),
    value => context.emit('result-state-change', value),
    { immediate: true }
  )
  const canStartCurrentIntake = computed(() => {
    return Boolean(state.canStartDiagnoseNow?.value)
  })

  return {
    ...state,
    canStartCurrentIntake,
    startDiagnose(...args) {
      if (!canStartCurrentIntake.value) {
        return false
      }
      return state.startDiagnose(...args)
    },
    previewUploadedImage(item) {
      previewDiagnosisImage(item, state.imageFiles?.value)
    },
    getUploadedImageLabel(item) {
      const slotType = String(item?.inputSlotType || item?.userDeclaredOrganType || '').trim()
      return (
        {
          whole_plant: '全株图',
          leaf: '叶片',
          stem: '茎',
          soil: '土表',
          root_crown: '根部'
        }[slotType] || '图片'
      )
    },
    finishFlow() {
      if (props.embedded) {
        state.resetDiagnose()
        return
      }
      context.emit('close')
    }
  }
}

export default {
  components: {
    DiagnoseIntake,
    DirectionChoiceCard,
    DiagnoseQuestionPackageSection,
    QuestionPackageResult,
    RetakeCard
  },
  props: {
    plantId: { type: [String, Number], default: '' },
    plantCatalogId: { type: [String, Number], default: '' },
    plantName: { type: String, default: '' },
    diagnosisProfile: { type: String, default: 'full' },
    entrySource: { type: String, default: 'diagnose_tab' },
    observedSymptoms: { type: Array, default: () => [] },
    contentPadding: { type: Boolean, default: false },
    embedded: { type: Boolean, default: false }
  },
  emits: ['success', 'close', 'result-state-change'],
  setup: setupDiagnoseFlow
}
</script>

<style scoped src="./style.css"></style>
