<template>
  <BottomSheet
    ref="popupRef"
    panel-id="pot-profile-editor-sheet"
    content-id="pot-profile-editor-content"
    close-id="pot-profile-editor-close-button"
    confirm-id="pot-profile-editor-confirm-button"
    title="盆型与基质"
    subtitle="填写盆口和盆高，就能估算每次浇水量。"
    :confirm-text="confirmText"
    loading-text="保存中..."
    height-mode="fullHeight"
    show-confirm
    :confirm-loading="saving"
    :on-confirm="save"
  >
    <PotProfileFormCore
      ref="formCoreRef"
      :initial-profile="props.plant?.potProfile"
      :id-prefix="'pot-profile-editor'"
      :loading="loading"
      @summary="value => emit('summary', value)"
      @change="syncConfirmText"
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
const confirmText = ref('填写关键尺寸')

function syncConfirmText() {
  const state = callComponentMethod(formCoreRef, 'getProfileState') || 'empty'
  confirmText.value =
    state === 'complete' ? '保存并更新建议' : state === 'basic' ? '保存基础盆型' : '填写关键尺寸'
}

async function open() {
  loading.value = true
  callComponentMethod(popupRef, 'open')
  // 应用当前植物 potProfile（null 时清空真实值，图形仅显示示例）
  callComponentMethod(formCoreRef, 'applyPotProfile', props.plant?.potProfile)
  syncConfirmText()
  loading.value = false
  // 等待 popup 动画完成后再初始化 canvas
  await callComponentMethod(formCoreRef, 'initCanvas')
}

function close() {
  callComponentMethod(popupRef, 'close')
}

async function save() {
  if (!callComponentMethod(formCoreRef, 'validate')) {
    syncConfirmText()
    return
  }
  if (!(await callComponentMethod(formCoreRef, 'confirmOversizedPot'))) {
    return
  }
  const plantId = props.plant?.id
  const payload = callComponentMethod(formCoreRef, 'getPayload')
  const savedData = callComponentMethod(formCoreRef, 'commitProfileData')

  // 无 plant：仅回传 payload，由父组件接收后自行处理（如独立浇水建议入口）
  if (!plantId) {
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
    emit('saved', savedData)
    uni.showToast({ title: '盆型信息已保存', icon: 'success' })
    close()
  } catch {
    uni.showToast({ title: '盆型信息暂未保存，请检查网络后重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

defineExpose({ open, close, summary: () => formCoreRef.value?.summary })
</script>
