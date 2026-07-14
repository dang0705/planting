<template>
  <BottomSheet
    ref="popupRef"
    panel-id="pot-profile-editor-sheet"
    content-id="pot-profile-editor-content"
    close-id="pot-profile-editor-close-button"
    confirm-id="pot-profile-editor-confirm-button"
    title="盆型与基质"
    subtitle="尺寸用于估算水量，基质用于修正保水与透气。"
    confirm-text="确认并保存"
    loading-text="保存中..."
    height-mode="fullHeight"
    show-confirm
    :confirm-loading="saving"
    :on-confirm="save"
  >
    <PotProfileFormCore
      ref="formCoreRef"
      :id-prefix="'pot-profile-editor'"
      :loading="loading"
      :initial-profile="props.plant?.potProfile"
      @summary="value => emit('summary', value)"
    />
  </BottomSheet>
</template>

<script setup>
import { ref } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import PotProfileFormCore from '@/components/pot-profile/PotProfileFormCore.vue'
import { usePlantStore } from '@/store/plants.js'
import { callComponentMethod } from '@/utils/component-ref.js'

const props = defineProps({ plant: { type: Object, default: null } })
const emit = defineEmits(['saved', 'summary'])
const plantStore = usePlantStore()
const popupRef = ref(null)
const formCoreRef = ref(null)
const loading = ref(false)
const saving = ref(false)

async function open() {
  loading.value = true
  callComponentMethod(popupRef, 'open')
  formCoreRef.value?.applyPotProfile(props.plant?.potProfile)
  loading.value = false
  await formCoreRef.value?.initCanvas()
}
function close() {
  callComponentMethod(popupRef, 'close')
}
async function save() {
  if (!(await formCoreRef.value?.confirmOversizedPot())) {
    return
  }
  const plantId = props.plant?.id
  const payload = formCoreRef.value?.getPayload()
  if (!payload) {
    return
  }
  const savedData = { ...payload }

  // 无 plant：仅回传 payload，由父组件接收后自行处理（如独立浇水建议入口）
  if (!plantId) {
    formCoreRef.value?.commitProfileData(savedData)
    emit('saved', savedData)
    close()
    return
  }

  // 有 plant：保持原落库链路
  saving.value = true
  try {
    const result = await plantStore.savePotProfile(plantId, payload)
    if (!result?.success) {
      throw new Error(result?.message || '保存失败')
    }
    formCoreRef.value?.commitProfileData(savedData)
    emit('saved', savedData)
    uni.showToast({ title: '盆型信息已保存', icon: 'success' })
    close()
  } catch (error) {
    uni.showToast({ title: error.message || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

defineExpose({ open, close })
</script>
