<template>
  <Layout title="浇水建议" left-action="back" background-class="bg-[#f8faf9]">
    <view class="min-h-screen bg-[#f8faf9] pb-5">
      <!-- 步骤指示器 -->
      <view class="flex items-center justify-center gap-2 px-4 pt-4">
        <view v-for="(label, index) in stepLabels" :key="index" class="flex items-center gap-2">
          <view
            class="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold"
            :class="index <= activeStep ? 'bg-[#2d7a4f] text-white' : 'bg-[#e1e9dd] text-[#53645a]'"
          >
            {{ index + 1 }}
          </view>
          <text
            class="text-[12px]"
            :class="index <= activeStep ? 'font-semibold text-[#1f2933]' : 'text-[#9ca3af]'"
          >
            {{ label }}
          </text>
          <view v-if="index < stepLabels.length - 1" class="mx-1 h-[1px] w-6 bg-[#e1e9dd]" />
        </view>
      </view>

      <swiper
        id="watering-advisor-swiper"
        class="min-h-screen"
        :current="activeStep"
        :duration="260"
        @change="handleSwiperChange"
      >
        <!-- 步骤1：选来源 -->
        <swiper-item>
          <template v-if="showMyPlantsList">
            <scroll-view scroll-y class="h-screen px-4 pt-6">
              <view class="mb-4 flex items-center gap-3">
                <text
                  id="watering-advisor-my-plants-back"
                  class="text-[24px] text-[#2d7a4f]"
                  @click="closeMyPlantsList"
                >
                  ‹
                </text>
                <text class="block text-[20px] font-bold leading-7 text-[#1f2937]">我的植物</text>
              </view>

              <view v-if="loadingMyPlants" class="py-10 text-center">
                <text class="text-[14px] text-[#9ca3af]">加载中...</text>
              </view>
              <view v-else-if="!plantStore.hasPlants" class="py-10 text-center">
                <text class="text-[14px] text-[#9ca3af]">还没有添加植物</text>
              </view>
              <view v-else id="watering-advisor-my-plants-list" class="flex flex-col gap-3">
                <PlantSelectCard
                  v-for="plant in plantStore.userPlants"
                  :key="plant.id"
                  :id="`watering-advisor-my-plant-card-${plant.id}`"
                  :plant="plant"
                  :selected="isUserPlantSelected(plant)"
                  @select="selectUserPlant"
                />
              </view>

              <view v-if="selectedUserPlantId" class="mt-4">
                <button
                  id="watering-advisor-my-plants-confirm-button"
                  class="m-0 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
                  @click="confirmUserPlantSelection"
                >
                  下一步：输入盆型
                </button>
              </view>
            </scroll-view>
          </template>
          <CatalogPlantSearch
            v-else
            ref="searchRef"
            :selected-plant="selectedCatalogPlant"
            @go-my-plants="openMyPlantsList"
            @next="goToPotProfile"
            @load-more="handleScrollLower"
            @select="selectCatalogPlant"
          />
        </swiper-item>

        <!-- 步骤2：输入盆型（inline 盆型表单，不打开 popup） -->
        <swiper-item>
          <scroll-view scroll-y class="h-screen px-4 pt-6">
            <view class="mb-4">
              <text class="block text-[20px] font-bold leading-7 text-[#1f2937]"> 盆型信息 </text>
              <text class="mt-1 block text-[13px] text-[#6b7280]">
                尺寸用于估算水量，基质和排水孔影响浇水策略
              </text>
            </view>

            <!-- 已选植物 -->
            <view
              class="mb-2 flex items-center gap-3 rounded-2xl border border-[#e1e9dd] bg-white p-3"
            >
              <image
                v-if="selectedCatalogPlant?.imageUrl"
                :src="selectedCatalogPlant.imageUrl"
                class="h-10 w-10 rounded-lg object-cover"
                mode="aspectFill"
              />
              <view
                v-else
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0f4ed]"
              >
                <text class="text-[16px]">🌿</text>
              </view>
              <text class="flex-1 text-[14px] font-medium text-[#1f2933]">
                {{ selectedCatalogPlantName }}
              </text>
            </view>

            <!-- inline 盆型与基质编辑内核 -->
            <PotProfileFormCore
              ref="potProfileFormRef"
              :id-prefix="'watering-advisor-pot-profile'"
              :initial-profile="selectedCatalogPlantPotProfile"
            />

            <view class="mt-4 flex gap-3">
              <button
                id="watering-advisor-back-1"
                class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
                @click="activeStep = 0"
              >
                上一步
              </button>
              <button
                id="watering-advisor-compute-button"
                class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
                :class="{ 'opacity-50': computing }"
                :disabled="computing"
                @click="goToResult"
              >
                {{ computing ? '计算中...' : '获取建议' }}
              </button>
            </view>
          </scroll-view>
        </swiper-item>

        <!-- 步骤3：展示建议 -->
        <swiper-item>
          <scroll-view scroll-y class="h-screen px-4 pt-6">
            <view v-if="computing" class="flex flex-col items-center justify-center py-20">
              <text class="text-[14px] text-[#9ca3af]">正在计算浇水建议...</text>
            </view>

            <view v-else-if="plannerResult" class="pb-6">
              <!-- 独立浇水最终结果：使用全局 formatMlRangeToBottleText 口径展示水量 -->
              <view
                id="watering-advisor-result-amount"
                class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-6 text-center"
              >
                <text class="block text-[22px] font-bold text-[#2d7a4f]">
                  {{ amountText || '暂无建议' }}
                </text>
              </view>

              <!-- 操作按钮 -->
              <view class="flex gap-3">
                <button
                  id="watering-advisor-back-2"
                  class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
                  @click="activeStep = 1"
                >
                  重新输入
                </button>
                <button
                  id="watering-advisor-done"
                  class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
                  @click="finishAdvisor"
                >
                  完成
                </button>
              </view>
            </view>

            <view v-else class="flex flex-col items-center justify-center py-20">
              <text class="text-[14px] text-[#9ca3af]">暂无建议结果</text>
              <button
                id="watering-advisor-empty-retry"
                class="mt-4 rounded-xl border border-[#2d7a4f] px-6 py-2 text-[14px] text-[#2d7a4f]"
                @click="activeStep = 1"
              >
                返回重新输入
              </button>
            </view>
          </scroll-view>
        </swiper-item>
      </swiper>
    </view>
  </Layout>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import PotProfileFormCore from '@/components/pot-profile/PotProfileFormCore.vue'
import PlantSelectCard from './components/PlantSelectCard.vue'
import { useUserStore } from '@/store/user.js'
import { usePlantStore } from '@/store/plants.js'
import CatalogPlantSearch from './components/CatalogPlantSearch.vue'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import { formatMlRangeToBottleText } from '@/utils/water-volume-format.js'
import {
  fetchAdhocPlannerResult,
  fetchWateringPlannerResult,
  saveAdvisorSession,
  todayStr,
  resolveWeatherLocation
} from '@/pages/index/components/watering-reminder-options.js'

const userStore = useUserStore()
const plantStore = usePlantStore()

const STEP_SOURCE = 0
const STEP_POT_PROFILE = 1
const STEP_RESULT = 2
const stepLabels = ['选植物', '盆型', '建议']
const activeStep = ref(STEP_SOURCE)
const selectedCatalogPlant = ref(null)
const computing = ref(false)
const plannerResult = ref(null)
const weatherDays = ref([])
const forecastDays = ref([])
const savedToBackend = ref(false)
const searchRef = ref(null)
const potProfileFormRef = ref(null)
const showMyPlantsList = ref(false)
const loadingMyPlants = ref(false)
const selectedUserPlantId = ref(null)

const selectedCatalogPlantName = computed(
  () =>
    selectedCatalogPlant.value?.primaryDisplayName ||
    selectedCatalogPlant.value?.canonicalName ||
    '未选择植物'
)

const selectedCatalogPlantPotProfile = computed(() => {
  const plant = selectedCatalogPlant.value
  if (!plant?.userPlantId) {
    return null
  }
  return plant.potProfile || null
})

const amountText = computed(() => {
  const range = plannerResult.value?.amountRangeMl
  if (!range || !Array.isArray(range) || range.length < 2) {
    return ''
  }
  return formatMlRangeToBottleText(range)
})

function selectCatalogPlant(plant) {
  selectedCatalogPlant.value = plant
  selectedUserPlantId.value = null
}

function handleScrollLower() {
  searchRef.value?.loadNextPage()
}

function handleSwiperChange(event) {
  const nextStep = Number(event?.detail?.current || STEP_SOURCE)
  if (nextStep > STEP_SOURCE && !selectedCatalogPlant.value) {
    uni.showToast({ title: '请先选择植物种类', icon: 'none' })
    activeStep.value = STEP_SOURCE
    return
  }
  if (nextStep > STEP_POT_PROFILE && !plannerResult.value && !computing.value) {
    activeStep.value = Math.min(nextStep, STEP_POT_PROFILE)
    return
  }
  activeStep.value = nextStep
}

async function openMyPlantsList() {
  showMyPlantsList.value = true
  if (await userStore.ensureLogin()) {
    loadingMyPlants.value = true
    try {
      await plantStore.getUserPlants()
    } finally {
      loadingMyPlants.value = false
    }
  }
}

function closeMyPlantsList() {
  showMyPlantsList.value = false
}

function isUserPlantSelected(plant) {
  return selectedUserPlantId.value === plant.id
}

function selectUserPlant(plant) {
  selectedUserPlantId.value = plant.id
  selectedCatalogPlant.value = {
    plantIdentityId: plant.plantIdentityId || '',
    sessionPlantId: plant.sessionPlantId || '',
    imageUrl: plant.image || '',
    primaryDisplayName: plant.displayName || '未命名植物',
    canonicalName: plant.canonicalName || '',
    plantGenus: plant.genus || '',
    userPlantId: plant.id,
    potProfile: plant.potProfile || null,
    wateringEvents: plant.wateringEvents || null
  }
}

function confirmUserPlantSelection() {
  if (!selectedCatalogPlant.value) {
    uni.showToast({ title: '请先选择植物', icon: 'none' })
    return
  }
  showMyPlantsList.value = false
  goToPotProfile()
}

function goToPotProfile() {
  if (!selectedCatalogPlant.value) {
    uni.showToast({ title: '请先选择植物种类', icon: 'none' })
    return
  }
  activeStep.value = STEP_POT_PROFILE
}

watch(activeStep, step => {
  if (step === STEP_POT_PROFILE) {
    nextTick(() => {
      potProfileFormRef.value?.initCanvas()
    })
  }
})

async function loadWeatherDays() {
  const location = resolveWeatherLocation(userStore.location)
  if (!location) {
    uni.showToast({ title: '未获取到定位，建议将使用默认天气', icon: 'none' })
    return
  }
  try {
    const window = await getEnvironmentWeatherWindow({
      ...location,
      diagnosisDate: todayStr(),
      mode: 'environment'
    })
    weatherDays.value = window?.historicalDays || window?.historical_days || []
    forecastDays.value = window?.forecastDays || window?.forecast_days || []
  } catch {
    weatherDays.value = []
    forecastDays.value = []
  }
}

function buildPotProfilePayload() {
  const payload = potProfileFormRef.value?.getPayload()
  if (!payload) {
    return {
      potTopDiameterCm: null,
      potBottomDiameterCm: null,
      potHeightCm: null,
      hasDrainageHole: 'true',
      substrateType: 'unknown'
    }
  }
  return {
    potTopDiameterCm: payload.potTopDiameterCm || null,
    potBottomDiameterCm: payload.potBottomDiameterCm || null,
    potHeightCm: payload.potHeightCm || null,
    hasDrainageHole: payload.hasDrainageHole,
    substrateType: payload.substrateType || 'unknown'
  }
}

async function goToResult() {
  const payload = buildPotProfilePayload()
  if (!payload.potTopDiameterCm || !payload.potHeightCm) {
    uni.showToast({ title: '请填写盆型尺寸', icon: 'none' })
    return
  }
  computing.value = true
  plannerResult.value = null
  savedToBackend.value = false
  activeStep.value = STEP_RESULT
  try {
    await loadWeatherDays()
    const isUserPlant = Boolean(selectedCatalogPlant.value?.userPlantId)
    let result
    if (isUserPlant) {
      result = await fetchWateringPlannerResult({
        plantId: selectedCatalogPlant.value.userPlantId,
        wateringEvents: selectedCatalogPlant.value.wateringEvents,
        weatherDays: weatherDays.value,
        forecastDays: forecastDays.value
      })
    } else {
      const catalogPlantId =
        selectedCatalogPlant.value?.plantIdentityId ||
        selectedCatalogPlant.value?.sessionPlantId ||
        ''
      result = await fetchAdhocPlannerResult({
        catalogPlantId,
        potProfile: payload,
        weatherDays: weatherDays.value,
        forecastDays: forecastDays.value
      })
    }
    if (result) {
      plannerResult.value = result
      if (!isUserPlant) {
        try {
          const catalogPlantId =
            selectedCatalogPlant.value?.plantIdentityId ||
            selectedCatalogPlant.value?.sessionPlantId ||
            ''
          await saveAdvisorSession({
            catalogPlantId,
            catalogPlantName: selectedCatalogPlantName.value,
            potProfile: payload,
            weatherSummary: result.weatherSummary || {},
            plannerResult: result.plannerResult || result
          })
          savedToBackend.value = true
        } catch {
          // 落库失败不影响展示
        }
      }
    } else {
      uni.showToast({ title: '计算失败，请重试', icon: 'none' })
      activeStep.value = STEP_POT_PROFILE
    }
  } catch {
    uni.showToast({ title: '计算失败，请重试', icon: 'none' })
    activeStep.value = STEP_POT_PROFILE
  } finally {
    computing.value = false
  }
}

function finishAdvisor() {
  uni.navigateBack()
}

onShow(() => {
  searchRef.value?.loadPlants('')
})
</script>
