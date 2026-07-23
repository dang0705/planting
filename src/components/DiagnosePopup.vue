<template>
  <BottomSheet
    ref="popup"
    id="diagnose-popup"
    panel-id="diagnose-popup-panel"
    content-id="diagnose-popup-scroll"
    close-id="diagnose-popup-close-button"
    title="AI 诊断"
    height-mode="fullHeight"
    @change="handleChange"
  >
    <view id="diagnose-popup-content-wrap" class="flex min-h-0 flex-1 flex-col">
      <DiagnoseFlow
        ref="flowRef"
        :plant-id="plantId"
        :plant-name="plantName"
        :diagnosis-profile="diagnosisProfile"
        :entry-source="entrySource"
        :observed-symptoms="observedSymptoms"
        @success="$emit('success', $event)"
        @close="close"
      />
    </view>
  </BottomSheet>
</template>

<script>
import { ref } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import DiagnoseFlow from '@/components/diagnose-flow/DiagnoseFlow.vue'
import { callComponentMethod } from '@/utils/component-ref.js'

export default {
  components: {
    BottomSheet,
    DiagnoseFlow
  },
  props: {
    plantId: { type: [String, Number], default: '' },
    plantName: { type: String, default: '' },
    diagnosisProfile: { type: String, default: 'full' },
    entrySource: { type: String, default: 'plant_card' },
    observedSymptoms: { type: Array, default: () => [] }
  },
  emits: ['success', 'close'],
  setup(_props, { emit, expose }) {
    const popup = ref(null)
    const flowRef = ref(null)

    function open() {
      callComponentMethod(popup, 'open')
      callComponentMethod(popup, 'refreshLayout')
    }

    function close() {
      resetDiagnose()
      callComponentMethod(popup, 'close')
    }

    function resetDiagnose() {
      callComponentMethod(flowRef, 'resetDiagnose')
    }

    function injectAutomationDiagnoseImages(images) {
      callComponentMethod(flowRef, 'injectAutomationDiagnoseImages', images)
    }

    function handleChange(event) {
      if (!event.show) {
        resetDiagnose()
        emit('close')
      }
    }

    expose({
      open,
      close,
      resetDiagnose,
      injectAutomationDiagnoseImages
    })

    return {
      popup,
      flowRef,
      open,
      close,
      handleChange,
      resetDiagnose,
      injectAutomationDiagnoseImages
    }
  }
}
</script>
