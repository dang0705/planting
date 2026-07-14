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
          <scroll-view scroll-y class="h-screen px-4 pt-6">
            <text class="mb-4 block text-[20px] font-bold leading-7 text-[#1f2937]">
              选择浇水建议方式
            </text>

            <!-- 已有植物入口 -->
            <view
              id="watering-advisor-my-plants-entry"
              class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-4"
              @click="goToMyPlants"
            >
              <view class="flex items-center gap-3">
                <view class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ea]">
                  <text class="text-[20px]">🌱</text>
                </view>
                <view class="flex-1">
                  <text class="block text-[15px] font-bold text-[#1f2933]">从我的植物选</text>
                  <text class="block text-[12px] text-[#6b7280]">
                    选择已添加的植物，基于浇水历史给出建议
                  </text>
                </view>
                <text class="text-[18px] text-[#9ca3af]">›</text>
              </view>
            </view>

            <!-- 植物种类入口 -->
            <view
              class="rounded-2xl border-2 p-4"
              :class="
                selectedCatalogPlant ? 'border-[#2d7a4f] bg-[#e8f3ea]' : 'border-[#e1e9dd] bg-white'
              "
            >
              <view class="mb-3 flex items-center gap-3">
                <view class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0f4ed]">
                  <text class="text-[20px]">🔍</text>
                </view>
                <view class="flex-1">
                  <text class="block text-[15px] font-bold text-[#1f2933]">搜索植物种类</text>
                  <text class="block text-[12px] text-[#6b7280]">
                    不需要添加植物，直接选种类获取建议
                  </text>
                </view>
              </view>

              <!-- 搜索框 -->
              <view
                class="mb-3 flex items-center gap-2 rounded-xl border border-[#e1e9dd] bg-[#f7faf5] px-3 py-2"
              >
                <text class="text-[14px] text-[#9ca3af]">🔎</text>
                <input
                  id="watering-advisor-search-input"
                  v-model="searchKeyword"
                  class="flex-1 text-[14px] text-[#1f2933]"
                  placeholder="搜索植物名称"
                  confirm-type="search"
                  @confirm="handleSearchConfirm"
                  @input="handleSearchInput"
                />
                <text v-if="searchKeyword" class="text-[14px] text-[#9ca3af]" @click="clearSearch">
                  ✕
                </text>
              </view>

              <!-- 搜索结果列表 -->
              <scroll-view
                v-if="defaultPlants.length"
                scroll-y
                class="max-h-[300px] rounded-xl border border-[#e1e9dd] bg-white"
              >
                <view
                  v-for="plant in defaultPlants"
                  :key="plant.plantIdentityId || plant.sessionPlantId"
                  class="flex items-center gap-3 border-b border-[#f0f4ed] px-3 py-2.5"
                  :class="isCatalogPlantSelected(plant) ? 'bg-[#e8f3ea]' : 'bg-white'"
                  @click="selectCatalogPlant(plant)"
                >
                  <image
                    v-if="plant.imageUrl"
                    :src="plant.imageUrl"
                    class="h-10 w-10 rounded-lg object-cover"
                    mode="aspectFill"
                  />
                  <view
                    v-else
                    class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0f4ed]"
                  >
                    <text class="text-[16px]">🌿</text>
                  </view>
                  <view class="flex-1">
                    <text class="block text-[14px] font-medium text-[#1f2933]">
                      {{ plant.primaryDisplayName || plant.canonicalName || '未知植物' }}
                    </text>
                    <text v-if="plant.plantGenus" class="block text-[11px] text-[#9ca3af]">
                      {{ plant.plantGenus }}
                    </text>
                  </view>
                  <text v-if="isCatalogPlantSelected(plant)" class="text-[16px] text-[#2d7a4f]">
                    ✓
                  </text>
                </view>
                <view
                  v-if="hasMorePlants"
                  class="px-3 py-2.5 text-center"
                  @click="handleScrollLower"
                >
                  <text class="text-[12px] text-[#2d7a4f]">
                    {{ plantsLoadingMore ? '加载中...' : '加载更多' }}
                  </text>
                </view>
              </scroll-view>

              <view v-if="!defaultPlants.length && !initialPlantsLoading" class="py-6 text-center">
                <text class="text-[12px] text-[#9ca3af]">输入植物名称开始搜索</text>
              </view>
              <view v-if="initialPlantsLoading" class="py-6 text-center">
                <text class="text-[12px] text-[#9ca3af]">搜索中...</text>
              </view>
            </view>

            <view v-if="selectedCatalogPlant" class="mt-4">
              <button
                id="watering-advisor-next-button"
                class="m-0 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
                @click="goToPotProfile"
              >
                下一步：输入盆型
              </button>
            </view>
          </scroll-view>
        </swiper-item>

        <!-- 步骤2：输入盆型 -->
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

            <view class="rounded-2xl border border-[#e1e9dd] bg-white p-4">
              <view class="flex items-center justify-between gap-3">
                <view class="flex-1">
                  <text class="block text-[14px] font-bold text-[#1f2933]">盆型与基质</text>
                  <text class="mt-1 block text-[12px] text-[#6b7280]">{{ potProfileSummary }}</text>
                </view>
                <button
                  id="watering-advisor-edit-pot-profile"
                  class="m-0 h-[40px] rounded-xl bg-[#e8f3ea] px-4 py-0 text-[13px] font-bold leading-[40px] text-[#2d7a4f]"
                  @click="openPotProfileEditor"
                >
                  {{ hasPotProfile ? '重新编辑' : '补充盆型' }}
                </button>
              </view>
            </view>

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
              <view class="mb-4">
                <text class="block text-[20px] font-bold leading-7 text-[#1f2937]"> 浇水建议 </text>
                <text class="mt-1 block text-[13px] text-[#6b7280]">
                  {{ selectedCatalogPlantName }}
                </text>
              </view>

              <!-- 下次浇水日期 -->
              <view class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-4">
                <view class="flex items-center justify-between">
                  <view>
                    <text class="block text-[12px] text-[#9ca3af]">建议下次浇水</text>
                    <text class="block text-[22px] font-bold text-[#2d7a4f]">
                      {{ plannerResult.nextWaterDate || '待定' }}
                    </text>
                  </view>
                  <text class="text-[32px]">💧</text>
                </view>
                <text
                  v-if="plannerResult.nextWaterReason"
                  class="mt-2 block text-[12px] text-[#6b7280]"
                >
                  {{ plannerResult.nextWaterReason }}
                </text>
              </view>

              <!-- 建议水量 -->
              <view
                v-if="amountBottleText"
                class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-4"
              >
                <view class="flex items-center justify-between">
                  <text class="text-[14px] font-bold text-[#1f2933]">建议水量</text>
                  <text class="text-[16px] font-bold text-[#2d7a4f]">{{ amountBottleText }}</text>
                </view>
                <text
                  v-if="plannerResult.stopCondition"
                  class="mt-1 block text-[12px] text-[#6b7280]"
                >
                  {{ plannerResult.stopCondition }}
                </text>
              </view>

              <!-- 浇水策略 -->
              <view class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-4">
                <text class="block text-[12px] text-[#9ca3af]">浇水策略</text>
                <text class="mt-1 block text-[14px] text-[#1f2933]">
                  {{ wateringContextLabel }}
                </text>
                <view v-if="plannerResult.reasonCodes?.length" class="mt-2 flex flex-wrap gap-1.5">
                  <view
                    v-for="code in plannerResult.reasonCodes"
                    :key="code"
                    class="rounded-full bg-[#f0f4ed] px-2 py-0.5"
                  >
                    <text class="text-[11px] text-[#53645a]">{{
                      reasonCodeLabel(code) || code
                    }}</text>
                  </view>
                </view>
              </view>

              <!-- 盆型概要 -->
              <view class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-4">
                <text class="block text-[12px] text-[#9ca3af]">盆型概要</text>
                <text class="mt-1 block text-[13px] text-[#1f2933]">{{ potProfileSummary }}</text>
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
                class="mt-4 rounded-xl border border-[#2d7a4f] px-6 py-2 text-[14px] text-[#2d7a4f]"
                @click="activeStep = 1"
              >
                返回重新输入
              </button>
            </view>
          </scroll-view>
        </swiper-item>
      </swiper>
      <PotProfileEditor
        ref="potProfileEditorRef"
        :plant="null"
        @saved="handlePotProfileSaved"
        @summary="handlePotProfileSummary"
      />
    </view>
  </Layout>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import PotProfileEditor from '@/pages/index/components/PotProfileEditor.vue'
import { useUserStore } from '@/store/user.js'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import { formatMlRangeToBottleText } from '@/utils/water-volume-format.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import {
  fetchAdhocPlannerResult,
  saveAdvisorSession,
  reasonCodeLabel,
  todayStr,
  resolveWeatherLocation,
  buildPotProfileSummary
} from '@/pages/index/components/watering-reminder-options.js'

const userStore = useUserStore()
const {
  plants: defaultPlants,
  loading: plantsLoading,
  initialLoading: initialPlantsLoading,
  loadingMore: plantsLoadingMore,
  hasMore: hasMorePlants,
  load: loadPlants,
  loadNextPage
} = useDefaultPlants()

const STEP_SOURCE = 0
const STEP_POT_PROFILE = 1
const STEP_RESULT = 2
const SEARCH_DEBOUNCE_MS = 500
const stepLabels = ['选植物', '盆型', '建议']
const activeStep = ref(STEP_SOURCE)
const searchKeyword = ref('')
const selectedCatalogPlant = ref(null)
const computing = ref(false)
const plannerResult = ref(null)
const weatherDays = ref([])
const forecastDays = ref([])
const savedToBackend = ref(false)
const potProfileEditorRef = ref(null)
const editorSummary = ref('')

let searchTimer = null

const potProfileForm = ref({
  potTopDiameterCm: '',
  potBottomDiameterCm: '',
  potHeightCm: '',
  hasDrainageHole: 'true'
})
const substrateComposition = ref([])

const selectedCatalogPlantName = computed(
  () =>
    selectedCatalogPlant.value?.primaryDisplayName ||
    selectedCatalogPlant.value?.canonicalName ||
    '未选择植物'
)

const amountBottleText = computed(() => {
  if (!plannerResult.value?.amountRangeMl) {
    return ''
  }
  return formatMlRangeToBottleText(plannerResult.value.amountRangeMl)
})

const wateringContextLabel = computed(() => {
  const context = plannerResult.value?.wateringContext
  if (!context) {
    return ''
  }
  const labels = {
    likely_too_wet: '近期偏湿，建议暂停浇水',
    likely_too_dry: '偏干，建议尽快浇水',
    keep_baseline_or_check_soil: '正常节奏，注意检查土壤'
  }
  return labels[context] || context
})

const hasPotProfile = computed(
  () => Boolean(potProfileForm.value.potTopDiameterCm) && Boolean(potProfileForm.value.potHeightCm)
)

const potProfileSummary = computed(() => {
  if (!potProfileForm.value.potTopDiameterCm && !potProfileForm.value.potHeightCm) {
    return editorSummary.value || '未填写盆型信息'
  }
  return buildPotProfileSummary({
    potTopDiameterCm: potProfileForm.value.potTopDiameterCm,
    potBottomDiameterCm: potProfileForm.value.potBottomDiameterCm,
    potHeightCm: potProfileForm.value.potHeightCm,
    hasDrainageHole: potProfileForm.value.hasDrainageHole,
    substrateType: substrateComposition.value.length
      ? JSON.stringify(substrateComposition.value)
      : 'unknown'
  })
})

function isCatalogPlantSelected(plant) {
  const selectedId =
    selectedCatalogPlant.value?.plantIdentityId || selectedCatalogPlant.value?.sessionPlantId
  const plantId = plant.plantIdentityId || plant.sessionPlantId
  return Boolean(selectedId) && selectedId === plantId
}

function selectCatalogPlant(plant) {
  selectedCatalogPlant.value = plant
}

function handleSearchInput() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    loadPlants(searchKeyword.value.trim())
  }, SEARCH_DEBOUNCE_MS)
}
function handleSearchConfirm() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  loadPlants(searchKeyword.value.trim())
}
function clearSearch() {
  searchKeyword.value = ''
  loadPlants('')
}
function handleScrollLower() {
  loadNextPage()
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

function goToMyPlants() {
  uni.switchTab({ url: '/pages/index/index' })
}

function goToPotProfile() {
  if (!selectedCatalogPlant.value) {
    uni.showToast({ title: '请先选择植物种类', icon: 'none' })
    return
  }
  activeStep.value = STEP_POT_PROFILE
  nextTick(() => openPotProfileEditor())
}

function openPotProfileEditor() {
  callComponentMethod(potProfileEditorRef, 'open')
}

function handlePotProfileSaved(payload) {
  potProfileForm.value = {
    potTopDiameterCm: payload?.potTopDiameterCm ? String(payload.potTopDiameterCm) : '',
    potBottomDiameterCm: payload?.potBottomDiameterCm ? String(payload.potBottomDiameterCm) : '',
    potHeightCm: payload?.potHeightCm ? String(payload.potHeightCm) : '',
    hasDrainageHole: payload?.hasDrainageHole || 'true'
  }
  substrateComposition.value = Array.isArray(payload?.substrateComposition)
    ? payload.substrateComposition
    : []
}

function handlePotProfileSummary(value) {
  editorSummary.value = value || ''
}

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
  return {
    potTopDiameterCm: potProfileForm.value.potTopDiameterCm || null,
    potBottomDiameterCm: potProfileForm.value.potBottomDiameterCm || null,
    potHeightCm: potProfileForm.value.potHeightCm || null,
    hasDrainageHole: potProfileForm.value.hasDrainageHole,
    substrateType: substrateComposition.value.length
      ? JSON.stringify(substrateComposition.value)
      : 'unknown'
  }
}

async function goToResult() {
  const dims = potProfileForm.value
  if (!dims.potTopDiameterCm || !dims.potHeightCm) {
    uni.showToast({ title: '请填写盆型尺寸', icon: 'none' })
    return
  }
  computing.value = true
  plannerResult.value = null
  savedToBackend.value = false
  activeStep.value = STEP_RESULT
  try {
    await loadWeatherDays()
    const catalogPlantId =
      selectedCatalogPlant.value?.plantIdentityId ||
      selectedCatalogPlant.value?.sessionPlantId ||
      ''
    const result = await fetchAdhocPlannerResult({
      catalogPlantId,
      potProfile: buildPotProfilePayload(),
      weatherDays: weatherDays.value,
      forecastDays: forecastDays.value
    })
    if (result) {
      plannerResult.value = result
      // 落库
      try {
        await saveAdvisorSession({
          catalogPlantId,
          catalogPlantName: selectedCatalogPlantName.value,
          potProfile: buildPotProfilePayload(),
          weatherSummary: result.weatherSummary || {},
          plannerResult: result.plannerResult || result
        })
        savedToBackend.value = true
      } catch {
        // 落库失败不影响展示
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
  loadPlants('')
})
</script>
