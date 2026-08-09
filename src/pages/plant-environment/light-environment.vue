<template>
  <Layout title="光照环境" left-action="back" background-class="bg-[#f8faf9]">
    <scroll-view
      id="plant-light-environment-page"
      scroll-y
      class="h-screen bg-[#f8faf9] px-4 pb-[140px] pt-4"
    >
      <view v-if="loading" class="flex min-h-[420px] items-center justify-center">
        <text class="text-sm text-[#6b7280]">正在读取光照环境...</text>
      </view>
      <view v-else>
        <view class="mb-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-4">
          <text class="block text-base font-semibold text-[#1f2937]">设置植物的光照环境</text>
          <text class="mt-1 block text-xs leading-5 text-[#6b7280]">
            根据植物现在的光照和离窗距离填写，完成后返回编辑页
          </text>
        </view>

        <LightEnvironmentPicker
          id-prefix="plant-light-environment"
          question-id="profile"
          :model-value="draft"
          :disabled="saving"
          @change="handleChange"
        />

        <button
          id="plant-light-environment-complete-button"
          class="mt-5 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          :class="{ 'opacity-50': saving }"
          :disabled="saving"
          @click="saveAndReturn"
        >
          {{ saving ? '保存中...' : '完成并返回编辑' }}
        </button>
      </view>
    </scroll-view>
  </Layout>
</template>

<script setup>
import { getCurrentInstance, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import { fetchUserPlant, patchUserPlant } from '@/api/plants-http.js'
import LightEnvironmentPicker from '@/components/LightEnvironmentPicker.vue'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import {
  createDefaultLightEnvironment,
  normalizeOptionalLightEnvironment,
  sanitizeLightEnvironment
} from '@/utils/light-environment.js'

const HTTP_OK = 200
const ERROR_NAV_DELAY_MS = 500
const pageInstance = getCurrentInstance()
const plantStore = usePlantStore()
const userStore = useUserStore()

const plantId = ref('')
const loading = ref(true)
const saving = ref(false)
const draft = ref(createDefaultLightEnvironment())

onLoad(options => {
  plantId.value = String(options?.plantId || '').trim()
  initialize()
})

async function initialize() {
  const id = Number(plantId.value)
  if (!id) {
    returnToEditorWithError('缺少植物信息')
    return
  }
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
  draft.value = sanitizeLightEnvironment(plant.lightEnvironment || {})
  loading.value = false
}

function handleChange(value) {
  draft.value = sanitizeLightEnvironment(value)
}

async function saveAndReturn() {
  if (saving.value) {
    return
  }
  const id = Number(plantId.value)
  const lightEnvironment = normalizeOptionalLightEnvironment(draft.value)
  if (!id || !lightEnvironment) {
    uni.showToast({ title: '请先设置光照环境', icon: 'none' })
    return
  }
  saving.value = true
  try {
    const response = await patchUserPlant({ id, lightEnvironment })
    if (response?.code !== HTTP_OK) {
      uni.showToast({ title: response?.message || '保存失败', icon: 'none' })
      return
    }
    plantStore.updateUserPlantLocal(id, { lightEnvironment })
    emitResult({ plantId: id, kind: 'light', value: lightEnvironment })
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

function returnToEditorWithError(message) {
  loading.value = false
  uni.showToast({ title: message, icon: 'none' })
  setTimeout(() => uni.navigateBack(), ERROR_NAV_DELAY_MS)
}
</script>
