<template>
  <BottomSheet
    ref="popup"
    id="diagnose-popup"
    panel-id="diagnose-popup-panel"
    content-id="diagnose-popup-scroll"
    close-id="diagnose-popup-close-button"
    title="AI 诊断"
    @change="handleChange"
  >
    <view id="diagnose-popup-content-wrap" class="popup-content-wrap">
      <view
        v-if="automationEnabled"
        id="diagnose-automation-inject-button"
        class="diagnose-automation-trigger"
        @click="injectAutomationDiagnoseImagesFromStorage"
      />
      <view id="diagnose-popup-content" class="pb-2">
        <DiagnoseUploadStage v-if="!result" :view="viewContext" />
        <DiagnoseResultStage v-if="result" :view="viewContext" />
      </view>
    </view>
    <template #confirm>
      <view id="diagnose-popup-footer" class="popup-footer">
        <view v-if="!result" id="diagnose-popup-footer-start">
          <button
            id="diagnose-submit-button"
            class="w-full bg-primary text-white font-semibold py-3 rounded-xl"
            :class="{ 'opacity-50': !canStartDiagnoseNow }"
            :disabled="!canStartDiagnoseNow"
            @click="startDiagnose"
          >
            开始诊断
          </button>
        </view>
        <view v-else id="diagnose-popup-footer-result-actions" class="space-y-2">
          <button
            v-if="hasActiveDiagnosisQuestions && canShowAdditionalImageUploader"
            id="diagnose-question-package-image-submit-button"
            class="w-full bg-[#2D6A4F] text-white py-2.5 rounded-xl text-sm"
            :class="{ 'opacity-50': isSubmittingQuestionFlow || !canSubmitAdditionalImagesNow }"
            :disabled="isSubmittingQuestionFlow || !canSubmitAdditionalImagesNow"
            @click="submitAdditionalImages"
          >
            {{ isSubmittingAdditionalImage ? '补图诊断中...' : '提交补图并重新诊断' }}
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
    </template>
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
  </BottomSheet>
</template>

<script>
import AIStreamDialog from './AIStreamDialog.vue'
import BottomSheet from '@/components/diagnose-popup/BottomSheet.vue'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import DiagnoseUploadStage from './diagnose-popup/DiagnoseUploadStage.vue'
import DiagnoseResultStage from './diagnose-popup/DiagnoseResultStage.vue'
import { setupDiagnosePopup } from './diagnose-popup/setup.js'

export default {
  components: {
    AIStreamDialog,
    BottomSheet,
    CareBehaviorTimeline,
    DiagnoseUploadStage,
    DiagnoseResultStage
  },
  props: {
    plantId: { type: [String, Number], default: '' },
    plantName: { type: String, default: '' },
    observedSymptoms: { type: Array, default: () => [] }
  },
  emits: ['success', 'close'],
  setup: setupDiagnosePopup
}
</script>

<style scoped src="./diagnose-popup/style.css"></style>
