<template>
  <view id="diagnose-flow" class="flex min-h-full flex-col">
    <view
      v-if="automationEnabled"
      id="diagnose-automation-inject-button"
      class="diagnose-automation-trigger"
      @click="injectAutomationDiagnoseImagesFromStorage"
    />
    <view id="diagnose-flow-content" class="flex-1 pb-3">
      <DiagnoseUploadStage v-if="!result" :view="viewContext" />
      <DiagnoseResultStage v-if="result" :view="viewContext" />
    </view>
    <view id="diagnose-flow-footer" class="border-t border-[#E5E7EB] bg-white px-4 py-3">
      <view v-if="!result" id="diagnose-flow-footer-start">
        <button
          id="diagnose-submit-button"
          class="w-full rounded-xl bg-primary py-3 font-semibold text-white"
          :class="{ 'opacity-50': !canStartDiagnoseNow }"
          :disabled="!canStartDiagnoseNow"
          @click="startDiagnose"
        >
          开始诊断
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
      <view v-else id="diagnose-flow-footer-result-actions" class="space-y-2">
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
        <view class="flex gap-2">
          <button
            id="diagnose-reset-button"
            class="flex-1 rounded-xl border border-primary bg-white py-2.5 text-sm font-semibold text-primary"
            @click="resetDiagnose"
          >
            重新诊断
          </button>
          <button
            id="diagnose-finish-button"
            class="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white"
            @click="finishFlow"
          >
            完成
          </button>
        </view>
      </view>
    </view>
    <AIStreamDialog
      ref="aiStreamDialogRef"
      :visible="showAIDialog"
      title="AI 智能诊断"
      icon="🩺"
      loading-text="正在诊断植物健康..."
      :confirm-text="result?.retakeRequest ? '查看补拍要求' : '进入问诊'"
      cancel-text="稍后再说"
      :show-cancel="true"
      @close="handleAIDialogClose"
      @cancel="handleAIDialogCancel"
      @confirm="handleAIDialogConfirm"
      @retry="handleAIRetry"
    />
  </view>
</template>

<script>
import AIStreamDialog from '@/components/AIStreamDialog.vue'
import DiagnoseUploadStage from './DiagnoseUploadStage.vue'
import DiagnoseResultStage from './DiagnoseResultStage.vue'
import { setupDiagnoseFlowState } from './setup.js'

function setupDiagnoseFlow(props, context) {
  const state = setupDiagnoseFlowState(props, context)
  return {
    ...state,
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
    AIStreamDialog,
    DiagnoseUploadStage,
    DiagnoseResultStage
  },
  props: {
    plantId: { type: [String, Number], default: '' },
    plantName: { type: String, default: '' },
    diagnosisProfile: { type: String, default: 'full' },
    entrySource: { type: String, default: 'diagnose_tab' },
    observedSymptoms: { type: Array, default: () => [] },
    embedded: { type: Boolean, default: false }
  },
  emits: ['success', 'close'],
  setup: setupDiagnoseFlow
}
</script>

<style scoped src="./style.css"></style>
