<template>
  <Layout :title="pageTitle" left-action="back" background-class="bg-[#F8F6F0]">
    <view id="airflow-page" class="min-h-screen px-4 pb-8 pt-2">
      <view
        v-if="isPlantEditorMode && pageLoading"
        class="flex min-h-[420px] items-center justify-center"
      >
        <text class="text-sm text-[#6b7280]">正在读取空气环境...</text>
      </view>

      <!-- 独立页面和植物编辑入口共用同一空气环境容器；植物模式只增加读取、保存和回传。 -->
      <AirEnvironmentAssessment
        v-else-if="!result"
        :id-prefix="isPlantEditorMode ? 'plant-air-environment' : 'airflow'"
        :model-value="activeDraft"
        height-mode="content"
        :disabled="saving"
        footer-position="fixed"
        :back-label="isPlantEditorMode ? '返回编辑' : ''"
        :back-id="isPlantEditorMode ? 'plant-air-environment-back-button' : ''"
        :completion-label="isPlantEditorMode ? (saving ? '保存中...' : '完成并返回编辑') : '完成'"
        :completion-id="
          isPlantEditorMode ? 'plant-air-environment-complete-button' : 'airflow-submit-button'
        "
        @change="handleDraftChange"
        @back="returnToEditor"
        @complete="handleComplete"
      />

      <text
        v-if="isPlantEditorMode && plantLoadError"
        id="plant-air-environment-load-error"
        class="mt-3 block text-xs leading-5 text-[#b45309]"
      >
        {{ plantLoadError }}，可以直接重新填写
      </text>

      <!-- 独立评估完成后的中性记录摘要；植物编辑模式完成后直接返回，不显示此摘要。 -->
      <view
        v-if="result"
        id="airflow-result-summary"
        class="mt-5 rounded-2xl border border-brand-border bg-white p-4"
      >
        <text class="block text-sm font-semibold text-ink-body">记录完成</text>
        <text class="mt-2 block text-xs leading-5 text-ink-muted">
          {{ resultSummary }}
        </text>
      </view>

      <button
        v-if="result"
        id="airflow-reset-button"
        class="mt-3 h-11 rounded-2xl border border-gray-200 bg-white p-0 text-sm font-bold leading-11 text-ink-body"
        @click="handleReset"
      >
        重新选择
      </button>
    </view>
  </Layout>
</template>

<script setup>
import { computed, getCurrentInstance, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { fetchUserPlant, patchUserPlant } from '@/api/plants-http.js'
import Layout from '@/Layout.vue'
import AirEnvironmentAssessment from '@/components/AirEnvironmentAssessment.vue'
import { useUserPlantAirEnvironment } from '@/composables/useUserPlantAirEnvironment.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import {
  createInitialAirEnvironmentInput,
  describeAirEnvironmentInput,
  isAirEnvironmentAnswerReady,
  sanitizeAirEnvironmentInput
} from '@/utils/air-environment.js'

const HTTP_OK = 200
const ERROR_NAV_DELAY_MS = 500
const pageInstance = getCurrentInstance()
const plantStore = usePlantStore()
const userStore = useUserStore()
const plantAirEnvironment = useUserPlantAirEnvironment({ plantStore })
const { draft: plantDraft, loadError: plantLoadError, setDraft, load, reset } = plantAirEnvironment

const draft = ref(createInitialAirEnvironmentInput())
const result = ref(null)
const plantId = ref('')
const returnTo = ref('')
const pageLoading = ref(false)
const saving = ref(false)
const plantRecord = ref(null)

const isPlantEditorMode = computed(() =>
  Boolean(plantId.value && returnTo.value === 'user-plant-detail')
)
const pageTitle = computed(() => (isPlantEditorMode.value ? '空气环境' : '空气环境评估'))
const activeDraft = computed(() => (isPlantEditorMode.value ? plantDraft.value : draft.value))

const resultSummary = computed(() => {
  if (!result.value) {
    return ''
  }
  return `已记录：${describeAirEnvironmentInput(result.value)}`
})

onLoad(options => {
  plantId.value = String(options?.plantId || '').trim()
  returnTo.value = String(options?.returnTo || '').trim()
  if (isPlantEditorMode.value) {
    initializePlantEditorMode()
  }
})

function handleDraftChange(value) {
  if (isPlantEditorMode.value) {
    setDraft(value)
    return
  }
  draft.value = sanitizeAirEnvironmentInput(value)
}

function handleComplete(value) {
  if (isPlantEditorMode.value) {
    savePlantAndReturn(value)
    return
  }
  result.value = sanitizeAirEnvironmentInput(value || draft.value)
}

function handleReset() {
  draft.value = createInitialAirEnvironmentInput()
  result.value = null
}

async function initializePlantEditorMode() {
  const id = Number(plantId.value)
  if (!id) {
    returnToEditorWithError('缺少植物信息')
    return
  }
  pageLoading.value = true
  if (!(await userStore.ensureLogin())) {
    returnToEditorWithError('请先登录')
    return
  }
  const response = await fetchUserPlant(id)
  const plant = response?.code === HTTP_OK ? response.data : null
  if (!plant) {
    returnToEditorWithError(response?.message || '未找到要编辑的植物')
    return
  }
  plantRecord.value = plant
  reset(id)
  await load(id, { preserveDraft: false })
  pageLoading.value = false
}

async function savePlantAndReturn(value) {
  if (saving.value) {
    return
  }
  const id = Number(plantId.value)
  const plant = plantRecord.value
  const input = value || plantDraft.value
  if (!id || !isAirEnvironmentAnswerReady(input)) {
    uni.showToast({ title: '请完成空气环境设置', icon: 'none' })
    return
  }
  saving.value = true
  try {
    const response = await patchUserPlant({
      id,
      airEnvironment: input,
      locationBinding: {
        careLocationId: plant?.careLocationId || '',
        locationKey: plant?.locationKey || ''
      }
    })
    const savedProfile = response?.data?.airEnvironment || null
    if (response?.code !== HTTP_OK || !savedProfile) {
      uni.showToast({ title: response?.message || '保存失败', icon: 'none' })
      return
    }
    emitResult({ plantId: id, kind: 'air', value: savedProfile })
    uni.navigateBack()
  } catch (error) {
    uni.showToast({ title: error?.message || '网络错误，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function emitResult(payload) {
  const eventChannel = pageInstance?.proxy?.getOpenerEventChannel?.()
  eventChannel?.emit('plant-environment-saved', payload)
}

function returnToEditor() {
  if (isPlantEditorMode.value) {
    uni.navigateBack()
  }
}

function returnToEditorWithError(message) {
  pageLoading.value = false
  uni.showToast({ title: message, icon: 'none' })
  setTimeout(() => uni.navigateBack(), ERROR_NAV_DELAY_MS)
}
</script>
