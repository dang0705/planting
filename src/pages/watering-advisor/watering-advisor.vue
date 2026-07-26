<template>
  <Layout title="浇水建议" left-action="back" background-class="bg-[#f8faf9]">
    <view class="flex h-screen min-h-0 flex-col bg-[#f8faf9] pb-5">
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

      <ButtonStepTrack
        id="watering-advisor-swiper"
        :active-index="activeStep"
        :step-count="stepLabels.length"
        viewport-class="w-full"
        item-class="relative min-h-0 overflow-hidden"
        active-item-class="h-full"
      >
        <template #step="{ index, active }">
          <view v-if="active && index === STEP_SOURCE" class="h-full">
            <CatalogPlantSearch
              ref="searchRef"
              :selected-plant="selectedCatalogPlant"
              :my-plants-expanded="showMyPlantsList"
              :my-plants-loading="shouldShowMyPlantsLoading"
              :my-plants="plantStore.userPlants"
              :selected-user-plant-id="selectedUserPlantId"
              @toggle-my-plants="handleMyPlantsPanelToggle"
              @select-user-plant="selectUserPlant"
              @load-more="handleScrollLower"
              @select="selectCatalogPlant"
            />
          </view>

          <!-- 步骤2：输入盆型（inline 渲染共享内核，不打开 popup） -->
          <scroll-view
            v-if="active && index === STEP_POT_PROFILE"
            scroll-y
            class="box-border h-full min-h-0 px-4 pt-6 pb-[112px]"
          >
            <view class="mb-4">
              <text class="block text-[20px] font-bold leading-7 text-[#1f2937]">盆型信息</text>
              <text class="mt-1 block text-[13px] text-[#6b7280]">
                尺寸用于估算水量，基质和排水孔影响浇水策略
              </text>
            </view>

            <!-- 已选植物 -->
            <view
              class="mb-4 flex items-center gap-3 rounded-2xl border border-[#e1e9dd] bg-white p-3"
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

            <!-- inline 共享盆型表单内核 -->
            <PotProfileFormCore
              ref="potProfileFormRef"
              :initial-profile="selectedCatalogPlantPotProfile"
              :id-prefix="'watering-advisor-pot-profile'"
              @summary="handlePotProfileSummary"
            />
          </scroll-view>

          <!-- 步骤3：展示建议 -->
          <scroll-view
            v-if="active && index === STEP_RESULT"
            scroll-y
            class="box-border h-full min-h-0 px-4 pt-6 pb-[112px]"
          >
            <view v-if="computing" class="flex flex-col items-center justify-center py-20">
              <text class="text-[14px] text-[#9ca3af]">正在计算浇水建议...</text>
            </view>

            <view v-else-if="plannerResult" class="pb-6">
              <!-- 独立浇水最终结果：矿泉水瓶/5L油桶口径，与首页一致 -->
              <view
                id="watering-advisor-result-amount"
                class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-6 text-center"
              >
                <text class="block text-[22px] font-bold text-[#2d7a4f]">
                  {{ amountText || '暂无建议' }}
                </text>
              </view>
            </view>

            <view v-else class="flex flex-col items-center justify-center py-20">
              <text class="text-[14px] text-[#9ca3af]">暂无建议结果</text>
            </view>
          </scroll-view>
        </template>
      </ButtonStepTrack>

      <!-- 统一吸底操作区：置于步骤轨道外，避免被任一步骤的滚动容器裁剪 -->
      <view
        v-if="activeStep === STEP_SOURCE"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border border-t border-[#e1e9dd] bg-[#f8faf9] px-4 pb-5 pt-3"
      >
        <button
          id="watering-advisor-next-button"
          class="m-0 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          :class="{ 'opacity-50': !selectedCatalogPlant }"
          :disabled="!selectedCatalogPlant"
          @click="goToPotProfile"
        >
          下一步：输入盆型
        </button>
      </view>
      <view
        v-else-if="activeStep === STEP_POT_PROFILE"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border flex gap-3 border-t border-[#e1e9dd] bg-[#f8faf9] px-4 pb-5 pt-3"
      >
        <button
          id="watering-advisor-back-1"
          class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
          @click="goToSourceStep"
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
      <view
        v-else-if="activeStep === STEP_RESULT"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border flex gap-3 border-t border-[#e1e9dd] bg-[#f8faf9] px-4 pb-5 pt-3"
      >
        <button
          id="watering-advisor-back-2"
          class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
          @click="goBackToPotProfile"
        >
          {{ plannerResult ? '重新输入' : '返回重新输入' }}
        </button>
        <button
          v-if="plannerResult"
          id="watering-advisor-done"
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          @click="finishAdvisor"
        >
          完成
        </button>
        <button
          v-else
          id="watering-advisor-empty-retry"
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          @click="goBackToPotProfile"
        >
          返回重新输入
        </button>
      </view>
    </view>
  </Layout>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import ButtonStepTrack from '@/components/common/ButtonStepTrack.vue'
import PotProfileFormCore from '@/components/pot-profile/PotProfileFormCore.vue'
import { useUserStore } from '@/store/user.js'
import { usePlantStore } from '@/store/plants.js'
import CatalogPlantSearch from './components/CatalogPlantSearch.vue'
import { formatMlRangeToBottleText } from '@/utils/water-volume-format.js'
import {
  fetchAdhocPlannerResult,
  fetchWateringPlannerResult,
  saveAdvisorSession,
  buildPotProfileSummary
} from '@/pages/index/components/watering-reminder-options.js'
import { useWateringAdvisorWeather } from './useWateringAdvisorWeather.js'

const userStore = useUserStore()
const plantStore = usePlantStore()

const STEP_SOURCE = 0
const STEP_POT_PROFILE = 1
const STEP_RESULT = 2
const AMOUNT_RANGE_MIN_LENGTH = 2
const stepLabels = ['选植物', '盆型', '建议']
const activeStep = ref(STEP_SOURCE)
const selectedCatalogPlant = ref(null)
const computing = ref(false)
const plannerResult = ref(null)
const savedToBackend = ref(false)
const searchRef = ref(null)
const potProfileFormRef = ref(null)
const editorSummary = ref('')
const showMyPlantsList = ref(false)
const loadingMyPlants = ref(false)
const selectedUserPlantId = ref(null)
const {
  weatherDays,
  forecastDays,
  weatherLocationKey,
  plannerLocationKey,
  loadWeatherDays
} = useWateringAdvisorWeather({ selectedCatalogPlant, plantStore, userStore })

const selectedCatalogPlantName = computed(
  () =>
    selectedCatalogPlant.value?.primaryDisplayName ||
    selectedCatalogPlant.value?.canonicalName ||
    '未选择植物'
)

const shouldShowMyPlantsLoading = computed(
  () => loadingMyPlants.value && !plantStore.userPlants.length
)

// 当前选中植物（我的植物）已有的 potProfile，传给共享内核作为 initialProfile
const selectedCatalogPlantPotProfile = computed(() => {
  const plant = selectedCatalogPlant.value
  if (!plant?.userPlantId) {
    return null
  }
  // 我的植物路径：从 plantStore 取该植物的 potProfile
  const userPlant = plantStore.userPlants?.find(item => item.id === plant.userPlantId)
  return userPlant?.potProfile || null
})

// 统一水量文案：调用全局 formatMlRangeToBottleText，与首页 WateringReminderSheet 口径一致
const amountText = computed(() => {
  const range = plannerResult.value?.amountRangeMl
  if (!range || !Array.isArray(range) || range.length < AMOUNT_RANGE_MIN_LENGTH) {
    return ''
  }
  return formatMlRangeToBottleText(range)
})

const potProfileSummary = computed(() => {
  const summaryText = editorSummary.value
  if (summaryText) {
    return summaryText
  }
  // 默认状态摘要：复用 buildPotProfileSummary，传入默认值
  return buildPotProfileSummary({
    potTopDiameterCm: '20',
    potBottomDiameterCm: '10',
    potHeightCm: '15',
    hasDrainageHole: 'true',
    substrateType: 'unknown'
  })
})

function selectCatalogPlant(plant) {
  selectedCatalogPlant.value = plant
  selectedUserPlantId.value = null
}

function handleScrollLower() {
  searchRef.value?.loadNextPage()
}

async function openMyPlantsList() {
  showMyPlantsList.value = true
  if (!(await userStore.ensureLogin())) {
    showMyPlantsList.value = false
    return
  }
  if (plantStore.userPlants.length) {
    await plantStore.getUserPlants()
    return
  }
  loadingMyPlants.value = true
  try {
    await plantStore.getUserPlants()
  } finally {
    loadingMyPlants.value = false
  }
}

function closeMyPlantsList() {
  showMyPlantsList.value = false
}

async function handleMyPlantsPanelToggle(expanded) {
  if (expanded) {
    await openMyPlantsList()
    return
  }
  closeMyPlantsList()
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
    wateringEvents: plant.wateringEvents || null,
    potProfile: plant.potProfile || null
  }
}

function goToPotProfile() {
  if (!selectedCatalogPlant.value) {
    uni.showToast({ title: '请先选择植物', icon: 'none' })
    return
  }
  activeStep.value = STEP_POT_PROFILE
}

function goToSourceStep() {
  activeStep.value = STEP_SOURCE
}

function goBackToPotProfile() {
  activeStep.value = STEP_POT_PROFILE
}

// 进入盆型步骤时初始化 canvas（step track 切换后 DOM 才渲染）
watch(activeStep, step => {
  if (step === STEP_POT_PROFILE) {
    nextTick(() => {
      potProfileFormRef.value?.initCanvas()
    })
  }
})

function handlePotProfileSummary(value) {
  editorSummary.value = value || ''
}

function buildPotProfilePayload() {
  // 从共享内核取当前表单数据（默认值或用户修改值）
  return potProfileFormRef.value?.getPayload() || null
}

async function goToResult() {
  const payload = buildPotProfilePayload()
  if (!payload || !payload.potTopDiameterCm || !payload.potHeightCm) {
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
      // 独立浇水建议：将当前步骤中的盆型（默认值或用户修改值）传给后端参与计算，
      // 后端优先使用此 potProfile 覆盖数据库旧值；首页浇水提醒不传此字段，仍走 DB 回退
      result = await fetchWateringPlannerResult({
        plantId: selectedCatalogPlant.value.userPlantId,
        wateringEvents: selectedCatalogPlant.value.wateringEvents,
        weatherDays: weatherDays.value,
        forecastDays: forecastDays.value,
        potProfile: payload,
        locationKey: plannerLocationKey.value,
        timezone: 'Asia/Shanghai'
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
        forecastDays: forecastDays.value,
        locationKey: plannerLocationKey.value,
        timezone: 'Asia/Shanghai'
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
