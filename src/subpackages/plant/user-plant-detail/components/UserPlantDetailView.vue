<template>
  <Layout title="植物详情" left-action="back" background-class="bg-[#F8F6F0]">
    <view id="user-plant-detail-page" class="min-h-screen bg-[#F8F6F0]">
      <view v-if="loading" class="flex min-h-screen items-center justify-center px-6">
        <text class="text-sm text-gray-500">正在加载植物信息...</text>
      </view>

      <view
        v-else-if="loadError && !plant"
        class="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      >
        <text class="text-4xl">🌿</text>
        <text class="mt-4 text-lg font-semibold text-gray-800">暂时无法打开植物详情</text>
        <text class="mt-2 text-sm leading-6 text-gray-400">{{ loadError }}</text>
        <button
          id="user-plant-detail-retry-button"
          class="mt-6 rounded-3xl bg-primary px-8 py-3.5 text-white"
          @click="loadPlant"
        >
          重新加载
        </button>
      </view>

      <view v-else-if="plant" class="pb-5">
        <!-- 内容区域 -->
        <!-- 植物头部信息 -->
        <view class="bg-white p-5 px-4 mb-3">
          <view class="relative w-full h-[240px] rounded-[20px] overflow-hidden mb-4">
            <image
              v-if="imageUrl"
              id="user-plant-detail-image"
              :src="imageUrl || plant?.imageUrl"
              class="w-full h-full"
              mode="aspectFill"
              @error="handleImageError"
            />
            <view
              v-else
              class="w-full h-full flex items-center justify-center"
              style="background: linear-gradient(135deg, #d8f3dc 0%, #b7e4c7 100%)"
            >
              <text class="text-[80px]">🪴</text>
            </view>
          </view>

          <view class="flex flex-col">
            <text class="text-2xl font-semibold text-gray-800 mb-1">{{ plant?.displayName }}</text>
            <text
              v-if="plant?.recognizedName && plant.recognizedName !== plant.displayName"
              class="text-[13px] text-gray-400 italic mb-3"
              >{{ plant.recognizedName }}</text
            >
            <view class="flex flex-wrap gap-3">
              <view class="flex items-center px-3 py-1.5 bg-gray-100 rounded-xl">
                <text class="text-sm mr-1">🌱</text>
                <text class="text-[13px] text-gray-600">{{ getDaysAgo(plant?.createdAt) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 快速操作 -->
        <view id="user-plant-detail-quick-actions" class="flex gap-2 px-4 mb-3">
          <button
            id="user-plant-detail-diagnose-button"
            class="flex-1 border border-gray-300 rounded-2xl p-3.5 px-2 flex flex-col items-center gap-1.5 border-none"
            style="background: linear-gradient(135deg, #2d7a4f 0%, #52b788 100%)"
            @click="startDiagnosis"
          >
            <text class="text-2xl">📷</text>
            <text class="text-xs text-white font-semibold">拍照诊断</text>
          </button>
          <button
            id="user-plant-detail-water-button"
            class="flex-1 bg-white border border-gray-300 rounded-2xl p-3.5 px-2 flex flex-col items-center gap-1.5"
            :disabled="wateringAction.isPending"
            @click="doWatering"
          >
            <text class="text-2xl">💧</text>
            <text class="text-xs text-gray-600 font-semibold">{{
              wateringAction.isPending ? '记录中…' : '浇水'
            }}</text>
          </button>
          <button
            id="user-plant-detail-edit-button"
            class="flex-1 bg-white border border-gray-300 rounded-2xl p-3.5 px-2 flex flex-col items-center gap-1.5"
            @click="editPlant"
          >
            <text class="text-2xl">✏️</text>
            <text class="text-xs text-gray-600 font-semibold">编辑信息</text>
          </button>
        </view>

        <view v-if="loadError" class="mx-4 mb-3 rounded-2xl bg-[#fff7ed] px-4 py-3">
          <text class="block text-sm text-[#9a3412]">{{ loadError }}</text>
          <button
            id="user-plant-detail-inline-retry-button"
            class="mt-2 rounded-xl bg-white px-4 py-2 text-xs text-[#9a3412]"
            @click="loadPlant"
          >
            重新加载
          </button>
        </view>

        <UserPlantAirEnvironmentCard
          v-if="!restrictedPlatform"
          :plant="plant"
          @saved="handleAirEnvironmentSaved"
        />

        <!-- 浇水信息 -->
        <view
          v-if="plant?.watering || plant?.lastWatered || plant?.nextWater"
          class="bg-white p-4 mb-3"
        >
          <text class="text-base font-semibold text-gray-800 block mb-4">💧 浇水记录</text>
          <view class="flex flex-col gap-3">
            <view
              class="flex items-center justify-between p-3 bg-[#F8F6F0] rounded-xl border-2 border-transparent"
              :class="{ '!border-[#F57C00] !bg-[#FFF3E0]': isWaterOverdue }"
            >
              <view class="flex items-center flex-1">
                <text class="text-2xl mr-3">💧</text>
                <view class="flex flex-col">
                  <text class="text-sm font-semibold text-gray-800 mb-0.5">浇水</text>
                  <text class="text-xs text-gray-400">{{ wateringText }}</text>
                </view>
              </view>
              <view class="flex flex-col items-end gap-1">
                <text v-if="plant?.lastWatered" class="text-[12px] text-gray-400">
                  上次: {{ formatDate(plant.lastWatered) }}
                </text>
                <text v-if="plant?.nextWater" class="text-[13px] text-gray-600">
                  下次: {{ formatNextTime(plant.nextWater) }}
                </text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="plant?.sunning" class="bg-white p-4 mb-3">
          <text class="text-base font-semibold text-gray-800 block mb-4">☀️ 光照需求</text>
          <view class="p-3 bg-[#F8F6F0] rounded-xl">
            <text class="text-sm text-gray-600 leading-relaxed">{{ sunningText }}</text>
          </view>
        </view>

        <view
          v-if="plant?.fertilization || plant?.fertilizationMonthly"
          id="user-plant-detail-fertilization-card"
          class="bg-white p-4 mb-3"
        >
          <text class="text-base font-semibold text-gray-800 block mb-4">🧪 施肥建议</text>
          <view v-if="plant?.fertilization" class="p-3 bg-[#F8F6F0] rounded-xl mb-3">
            <text class="text-sm text-gray-600 leading-relaxed">{{ fertilizationText }}</text>
          </view>

          <view
            v-if="fertilizationMonthly.available"
            id="user-plant-detail-fertilization-monthly-table"
          >
            <text class="text-sm font-semibold text-gray-800 block mb-2">施肥时间表</text>
            <FertilizationMonthlyTable
              :monthly="fertilizationMonthly"
              table-id="user-plant-detail-fertilization-monthly-table-content"
            />
          </view>

          <view
            v-else
            id="user-plant-detail-fertilization-monthly-unavailable"
            class="p-3 bg-[#F8F6F0] rounded-xl"
          >
            <text class="text-xs leading-5 text-gray-500">该植物属暂无已审核的月度施肥表</text>
          </view>
        </view>

        <view
          v-if="plant?.temperatureMin !== null || plant?.humidityMin !== null || plant?.ventilation"
          class="bg-white p-4 mb-3"
        >
          <text class="text-base font-semibold text-gray-800 block mb-4">🌡️ 环境建议</text>
          <view class="flex flex-col gap-2">
            <view v-if="temperatureText" class="p-3 bg-[#F8F6F0] rounded-xl">
              <text class="text-sm text-gray-600">{{ temperatureText }}</text>
            </view>
            <view v-if="humidityText" class="p-3 bg-[#F8F6F0] rounded-xl">
              <text class="text-sm text-gray-600">{{ humidityText }}</text>
            </view>
            <view v-if="ventilationText" class="p-3 bg-[#F8F6F0] rounded-xl">
              <text class="text-sm text-gray-600">{{ ventilationText }}</text>
            </view>
          </view>
        </view>

        <!-- 危险操作 -->
        <view class="px-4 mt-5">
          <button
            id="user-plant-detail-delete-button"
            class="w-full bg-white border-2 border-[#F44336] rounded-2xl p-3.5 flex items-center justify-center gap-2"
            @click="confirmDelete"
          >
            <text class="text-lg">🗑️</text>
            <text class="text-sm text-[#F44336] font-semibold">删除植物</text>
          </button>
        </view>
      </view>
      <view v-else class="flex min-h-screen items-center justify-center px-6">
        <text class="text-sm text-gray-500">未找到这株植物</text>
      </view>
      <FeatureUnavailableModal
        v-model="featureUnavailableVisible"
        :feature-key="openedFeatureKey"
      />
    </view>
  </Layout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import { fetchUserPlant } from '@/api/plants-http.js'
import { useFileUrl } from '@/composables/useCloudFile.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import FertilizationMonthlyTable from '@/components/FertilizationMonthlyTable.vue'
import UserPlantAirEnvironmentCard from '@/components/UserPlantAirEnvironmentCard.vue'
import { createAsyncActionGuard } from '@/utils/interaction-guard.js'
import { parsePlantDateTime } from '@/utils/plant-datetime.js'
import { requireMvpAccess } from '@/utils/subscription-access.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import {
  isDiagnosisAvailable,
  isFeatureAvailable,
  isRestrictedMiniProgram
} from '@/utils/platform-capabilities.js'

const HTTP_SUCCESS_CODE = 200
const props = defineProps({
  plantId: { type: Number, required: true }
})
const plantStore = usePlantStore()
const userStore = useUserStore()
const restrictedPlatform = isRestrictedMiniProgram()
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()

const plantId = computed(() => Number(props.plantId) || null)
const plant = ref(null)
const loading = ref(false)
const loadError = ref('')
const wateringAction = createAsyncActionGuard()
let loadVersion = 0
const imageFileId = computed(() => plant.value?.imageFileId || plant.value?.photos?.[0] || '')
const { url: imageUrl, resolve: resolveImageUrl, refresh: refreshImageUrl } = useFileUrl()
const imageRetryCount = ref(0)

watch(
  imageFileId,
  nextFileId => {
    imageRetryCount.value = 0
    resolveImageUrl(nextFileId)
  },
  { immediate: true }
)

onMounted(async () => {
  await loadPlant()
})

watch(plantId, (nextId, previousId) => {
  if (nextId === previousId) {
    return
  }
  loadVersion += 1
  loading.value = false
  plant.value = null
  loadError.value = ''
  if (nextId) {
    loadPlant()
  }
})

async function loadPlant() {
  if (loading.value) {
    return false
  }
  const version = ++loadVersion
  const requestedPlantId = plantId.value
  loading.value = true
  loadError.value = ''
  try {
    if (!requestedPlantId) {
      loadError.value = '未找到这株植物的信息'
      return false
    }
    if (!(await userStore.ensureLogin())) {
      loadError.value = '查看植物详情需要先登录'
      return false
    }
    const response = await fetchUserPlant(requestedPlantId)
    if (version !== loadVersion || requestedPlantId !== plantId.value) {
      return false
    }
    if (response?.code !== HTTP_SUCCESS_CODE || !response.data) {
      loadError.value = '暂时无法加载植物信息，请稍后重试'
      return false
    }
    plant.value = response.data
    plantStore.updateUserPlantLocal?.(plant.value.id, plant.value)
    return true
  } catch {
    if (version === loadVersion && requestedPlantId === plantId.value) {
      loadError.value = '暂时无法加载植物信息，请检查网络后重试'
    }
    return false
  } finally {
    if (version === loadVersion) {
      loading.value = false
    }
  }
}

function handleAirEnvironmentSaved(airEnvironment) {
  if (!plant.value) {
    return
  }
  plant.value = { ...plant.value, airEnvironment }
  plantStore.applyAirEnvironmentLocal?.(plant.value.id, airEnvironment)
  loadError.value = ''
}

defineExpose({ refresh: loadPlant })

async function handleImageError() {
  if (!imageFileId.value || imageRetryCount.value >= 1) {
    imageUrl.value = ''
    return
  }
  imageRetryCount.value += 1
  await refreshImageUrl()
}

// 是否需要浇水（已过期）
const isWaterOverdue = computed(() => {
  if (!plant.value?.nextWater) {
    return false
  }
  const dueAt = parsePlantDateTime(plant.value.nextWater)
  return Boolean(dueAt && dueAt.getTime() <= Date.now())
})

const wateringText = computed(() => {
  const watering = plant.value?.watering
  if (!watering) {
    return '按实际养护情况手动记录'
  }
  const freqText =
    Array.isArray(watering.freq) && watering.freq.length
      ? `${watering.freq[0]}${watering.freq[1] ? `-${watering.freq[1]}` : ''}${watering.unit || '天'}`
      : ''
  return [watering.way, freqText].filter(Boolean).join(' · ')
})

const sunningText = computed(() => {
  const sunning = plant.value?.sunning
  if (!sunning) {
    return ''
  }
  const freqText =
    Array.isArray(sunning.freq) && sunning.freq.length
      ? `${sunning.freq[0]}${sunning.freq[1] ? `-${sunning.freq[1]}` : ''}${sunning.unit || ''}`
      : ''
  return [sunning.way, freqText, sunning.other].filter(Boolean).join(' · ')
})

const fertilizationText = computed(() => {
  const fertilization = plant.value?.fertilization
  if (!fertilization) {
    return ''
  }
  const freqText =
    Array.isArray(fertilization.freq) && fertilization.freq.length
      ? `${fertilization.freq[0]}${fertilization.freq[1] ? `-${fertilization.freq[1]}` : ''}${fertilization.unit || '天'}`
      : ''
  return [fertilization.type, freqText, fertilization.other].filter(Boolean).join(' · ')
})

const fertilizationMonthly = computed(() => {
  return (
    plant.value?.fertilizationMonthly || {
      available: false,
      rows: [],
      notes: '',
      scopeLabel: '',
      sourceNames: []
    }
  )
})

const temperatureText = computed(() => {
  if (plant.value?.temperatureMin === null || plant.value?.temperatureMax === null) {
    return ''
  }
  return `建议温度 ${plant.value.temperatureMin}-${plant.value.temperatureMax}°C`
})

const humidityText = computed(() => {
  if (plant.value?.humidityMin === null || plant.value?.humidityMax === null) {
    return ''
  }
  return `建议湿度 ${plant.value.humidityMin}-${plant.value.humidityMax}%`
})

const ventilationText = computed(() => {
  const ventilation = plant.value?.ventilation
  if (!ventilation) {
    return ''
  }
  return [
    `通风 ${ventilation.level || ''}`,
    ventilation.sensitivity ? `敏感度 ${ventilation.sensitivity}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
})

async function startDiagnosis() {
  if (!isDiagnosisAvailable('plant_detail')) {
    openFeatureUnavailable('diagnosis')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'plant_detail_diagnose' }))) {
    return
  }
  const query = [
    `plantId=${encodeURIComponent(String(plantId.value || ''))}`,
    `plantName=${encodeURIComponent(plant.value?.displayName || '植物')}`,
    plant.value?.plantId ? `plantCatalogId=${encodeURIComponent(String(plant.value.plantId))}` : '',
    'entrySource=plant_detail'
  ]
    .filter(Boolean)
    .join('&')
  uni.navigateTo({ url: `/subpackages/diagnosis/flow?${query}` })
}

async function doWatering() {
  if (!isFeatureAvailable('watering')) {
    openFeatureUnavailable('watering')
    return
  }
  return wateringAction.run(async () => {
    reportAnalyticsEvent(ANALYTICS_EVENTS.ENTER_USER_PLANT_WATERING)
    const result = await plantStore.completeWatering(plantId.value)
    if (result.success) {
      reportAnalyticsEvent(ANALYTICS_EVENTS.WATERING_RECORDED)
      plant.value = {
        ...plant.value,
        lastWatered: result.data?.lastWatered || plant.value?.lastWatered,
        nextWater: null,
        wateringReminder: null
      }
      const refreshed = await loadPlant()
      uni.showToast({
        title: refreshed ? '浇水完成' : '已记录浇水，详情稍后更新',
        icon: refreshed ? 'success' : 'none'
      })
    } else {
      uni.showToast({ title: '浇水记录暂未保存，请检查网络后重试', icon: 'none' })
    }
  })
}

function editPlant() {
  uni.navigateTo({
    url: `/subpackages/plant/user-plant-detail/user-plant-detail?mode=edit&id=${plantId.value}`
  })
}

function confirmDelete() {
  uni.showModal({
    title: '确认删除',
    content:
      '将永久删除这株植物及其养护、提醒和诊断记录。已添加到手机日历的提醒不会自动删除，请手动移除。',
    confirmText: '删除',
    confirmColor: '#F44336',
    success: async res => {
      if (res.confirm) {
        const result = await plantStore.deleteUserPlant(plantId.value)
        if (result.success) {
          uni.showToast({
            title: result.message || '已删除',
            icon: result.cleanupPending ? 'none' : 'success'
          })
          setTimeout(() => uni.navigateBack(), 1500)
        } else {
          uni.showToast({ title: '暂时无法删除植物，请检查网络后重试', icon: 'none' })
        }
      }
    }
  })
}

function getDaysAgo(date) {
  if (!date) {
    return '未知'
  }
  const d = parsePlantDateTime(date)
  if (!d) {
    return '未知'
  }
  const days = Math.floor((new Date() - d) / (1000 * 60 * 60 * 24))
  if (days === 0) {
    return '今天添加'
  }
  return `添加 ${days} 天`
}

function formatNextTime(time) {
  if (!time) {
    return ''
  }
  const date = parsePlantDateTime(time)
  if (!date) {
    return ''
  }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return '今天'
  }
  if (diffDays === 1) {
    return '明天'
  }
  if (diffDays === -1) {
    return '昨天'
  }
  if (diffDays > 0) {
    return `${diffDays}天后`
  }
  return `已过${Math.abs(diffDays)}天`
}

function formatDate(dateString) {
  if (!dateString) {
    return ''
  }
  const date = parsePlantDateTime(dateString)
  if (!date) {
    return ''
  }
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) {
    return '刚刚'
  }
  if (diffMins < 60) {
    return `${diffMins}分钟前`
  }
  if (diffHours < 24) {
    return `${diffHours}小时前`
  }
  if (diffDays < 7) {
    return `${diffDays}天前`
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
