<template>
  <BottomSheet
    ref="popupRef"
    :panel-id="`${idPrefix}-sheet`"
    :content-id="`${idPrefix}-content`"
    :close-id="`${idPrefix}-close-button`"
    :confirm-id="`${idPrefix}-confirm-button`"
    title="盆型与基质"
    subtitle="填写盆口和盆高，就能估算每次浇水量。"
    loading-text="保存中..."
    height-mode="fullHeight"
    show-confirm
    :confirm-loading="saving || confirming"
    :confirm-text="confirmText"
    :on-confirm="confirm"
  >
    <PotProfileFormCore
      ref="formCoreRef"
      :initial-profile="initialProfile"
      :id-prefix="idPrefix"
      :loading="loading"
      @summary="emit('summary', $event)"
    />
  </BottomSheet>
</template>

<script setup>
import { ref } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import PotProfileFormCore from '@/components/pot-profile/PotProfileFormCore.vue'
import { callComponentMethod } from '@/utils/component-ref.js'

const props = defineProps({
  initialProfile: { type: Object, default: null },
  idPrefix: { type: String, default: 'user-plant-pot-profile' },
  saving: { type: Boolean, default: false },
  confirmText: { type: String, default: '确认并保存' }
})
const emit = defineEmits(['save', 'summary'])
const popupRef = ref(null)
const formCoreRef = ref(null)
const loading = ref(false)
const confirming = ref(false)

async function open() {
  loading.value = true
  callComponentMethod(popupRef, 'open')
  formCoreRef.value?.applyPotProfile(props.initialProfile)
  loading.value = false
  await formCoreRef.value?.initCanvas()
}

async function confirm() {
  if (confirming.value) {
    return
  }
  confirming.value = true
  try {
    if (!(await formCoreRef.value?.confirmOversizedPot())) {
      return
    }
    emit('save', formCoreRef.value?.commitProfileData() || null)
  } finally {
    confirming.value = false
  }
}

function close() {
  callComponentMethod(popupRef, 'close')
}

defineExpose({ open, close })
</script>
