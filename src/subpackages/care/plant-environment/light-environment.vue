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
        <view class="rounded-[20px] border border-emerald-100 bg-white px-4 py-4 shadow-sm">
          <LightEnvironmentPicker
            id-prefix="plant-light-environment"
            question-id="profile"
            :model-value="draft"
            :plant-name="plantName"
            :disabled="saving"
            @change="handleChange"
          />
        </view>

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
      <view
        v-if="featureUnavailable"
        id="plant-light-environment-unavailable"
        class="fixed inset-0 z-40 flex items-center justify-center bg-[#f8faf9] px-6 text-center"
      >
        <text class="text-sm leading-6 text-[#667085]">当前端暂未开放养护环境设置，敬请期待。</text>
      </view>
      <FeatureUnavailableModal
        v-model="featureUnavailableVisible"
        :feature-key="openedFeatureKey"
      />
    </scroll-view>
  </Layout>
</template>

<script setup>
import { getCurrentInstance, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import { fetchUserPlant, patchUserPlant } from '@/api/plants-http.js'
import LightEnvironmentPicker from '@/components/LightEnvironmentPicker.vue'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import {
  createDefaultLightEnvironment,
  getLightEnvironmentSignature,
  markLightEnvironmentAsUser,
  normalizeOptionalLightEnvironment,
  sanitizeLightEnvironment
} from '@/utils/light-environment.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isFeatureAvailable } from '@/utils/platform-capabilities.js'

const HTTP_OK = 200
const ERROR_NAV_DELAY_MS = 500
const pageInstance = getCurrentInstance()
const plantStore = usePlantStore()
const userStore = useUserStore()
const featureUnavailable = !isFeatureAvailable('watering')
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()

const plantId = ref('')
const loading = ref(true)
const saving = ref(false)
const draft = ref(createDefaultLightEnvironment())
const plantName = ref('植物')

onLoad(options => {
  if (featureUnavailable) {
    openFeatureUnavailable('watering')
    return
  }
  plantId.value = String(options?.plantId || '').trim()
  initialize()
})

async function initialize() {
  try {
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
      returnToEditorWithError('未找到要编辑的植物')
      return
    }
    plantName.value = String(
      plant.displayName || plant.nickname || plant.canonicalName || plant.recognizedName || '植物'
    ).trim()
    draft.value = sanitizeLightEnvironment(plant.lightEnvironment || {})
  } catch {
    returnToEditorWithError('暂时无法读取植物信息，请检查网络后重试')
  } finally {
    loading.value = false
  }
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
  const confirmedLightEnvironment = markLightEnvironmentAsUser(lightEnvironment)
  saving.value = true
  try {
    const response = await patchUserPlant({ id, lightEnvironment: confirmedLightEnvironment })
    if (response?.code !== HTTP_OK) {
      uni.showToast({ title: '光照信息暂未保存，请检查网络后重试', icon: 'none' })
      return
    }
    const readback = await fetchUserPlant(id)
    const saved = readback?.code === HTTP_OK ? readback.data?.lightEnvironment : null
    if (
      !saved ||
      getLightEnvironmentSignature(saved) !==
        getLightEnvironmentSignature(confirmedLightEnvironment)
    ) {
      throw new Error('保存结果未读回，请重试')
    }
    reportAnalyticsEvent(ANALYTICS_EVENTS.LIGHT_ENVIRONMENT_SAVED)
    plantStore.updateUserPlantLocal(id, { lightEnvironment: confirmedLightEnvironment })
    emitResult({ plantId: id, kind: 'light', value: confirmedLightEnvironment })
    uni.navigateBack()
  } catch {
    uni.showToast({ title: '光照信息暂未保存，请检查网络后重试', icon: 'none' })
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
