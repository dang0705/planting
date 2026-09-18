<template>
  <Layout
    title="青花植"
    background-class="bg-[#f8faf9]"
    header-class="shadow-[0_1px_1.5px_rgba(0,0,0,0.1),0_1px_1px_rgba(0,0,0,0.1)]"
    :header-style="{ background: '#2d7a4f' }"
  >
    <template #title>
      <text class="block text-2xl font-medium leading-9 tracking-[0.07px] text-white">青花植</text>
    </template>

    <view id="index-home-content" class="relative">
      <view id="index-top-controls" class="bg-[#e8f5e9] px-4 pb-4 pt-3">
        <PlantSearchToolbar
          id-prefix="index"
          ai-text="AI 识别"
          compact
          :show-cancel="homeSearchFocused"
          :search-keyword="homeSearchKeyword"
          @focus="handleHomeSearchFocus"
          @update:search-keyword="handleHomeSearchInput"
          @search-confirm="handleHomeSearchConfirm"
          @clear-search="handleHomeSearchClear"
          @cancel-search="handleHomeSearchCancel"
          @ai-identify="handleHomeAiIdentify"
        />
      </view>

      <PopularPlantList
        :visible="homeSearchFocused"
        :plants="homeSearchResults"
        :loading="homePlantsLoading"
        class="absolute left-4 right-4 top-[73px] z-50"
        @select="handleHomePlantSelect"
      />

      <view
        id="index-page"
        class="flex min-h-[calc(100vh-var(--app-header-height)-70px-64px)] flex-col items-center justify-center px-6 pb-8"
      >
        <view id="index-common-tools" class="w-full max-w-[345px] translate-y-10">
          <text
            class="block text-center text-[20px] font-semibold leading-7 tracking-[0.07px] text-[#0a0a0a]"
            >您好！我是青花植</text
          >
          <text class="mt-2 block text-center text-sm leading-5 tracking-[-0.15px] text-[#5a7a68]"
            >室内绿植养护神器</text
          >

          <view class="mt-8 grid grid-cols-3 gap-3">
            <view
              id="index-tool-diagnosis"
              class="flex h-[146.64px] flex-col items-center justify-center gap-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white px-3 py-6 shadow-[0_1px_1.5px_rgba(0,0,0,0.1),0_1px_1px_rgba(0,0,0,0.1)] active:bg-[#f5faf6]"
              @click="handleOpenDiagnosisTool"
            >
              <view class="flex size-16 items-center justify-center rounded-2xl bg-[#e8f5e9]">
                <image :src="diagnoseToolIcon" class="size-9" mode="aspectFit" />
              </view>
              <text
                class="text-center text-sm font-semibold leading-[17.5px] tracking-[-0.15px] text-[#0a0a0a]"
                >诊断工具</text
              >
            </view>
            <view
              id="index-tool-watering"
              class="flex h-[146.64px] flex-col items-center justify-center gap-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white px-3 py-6 shadow-[0_1px_1.5px_rgba(0,0,0,0.1),0_1px_1px_rgba(0,0,0,0.1)] active:bg-[#f5faf6]"
              @click="handleOpenWateringTool"
            >
              <view class="flex size-16 items-center justify-center rounded-2xl bg-[#e8f5e9]">
                <image :src="wateringToolIcon" class="size-9" mode="aspectFit" />
              </view>
              <text
                class="text-center text-sm font-semibold leading-[17.5px] tracking-[-0.15px] text-[#0a0a0a]"
                >浇水计算器</text
              >
            </view>
            <view
              id="index-tool-identify"
              class="flex h-[146.64px] flex-col items-center justify-center gap-4 rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white px-3 py-6 shadow-[0_1px_1.5px_rgba(0,0,0,0.1),0_1px_1px_rgba(0,0,0,0.1)] active:bg-[#f5faf6]"
              @click="handleOpenIdentifyTool"
            >
              <view class="flex size-16 items-center justify-center rounded-2xl bg-[#e8f5e9]">
                <image :src="identifyToolIcon" class="size-9" mode="aspectFit" />
              </view>
              <text
                class="text-center text-sm font-semibold leading-[17.5px] tracking-[-0.15px] text-[#0a0a0a]"
                >植物识别</text
              >
            </view>
          </view>
        </view>
      </view>
    </view>
    <AIStreamDialog
      ref="homeAiDialogRef"
      :visible="homeAiDialogVisible"
      title="识别植物"
      icon="🔍"
      loading-text="正在识别植物..."
      confirm-text="使用识别结果"
      @close="handleHomeAiClose"
      @confirm="handleHomeAiConfirm"
      @retry="handleHomeAiRetry"
    />
    <FeatureUnavailableModal v-model="featureUnavailableVisible" :feature-key="openedFeatureKey" />
  </Layout>
</template>

<script setup>
import Layout from '@/Layout.vue'
import AIStreamDialog from '@/components/AIStreamDialog.vue'
import PlantSearchToolbar from '@/components/PlantSearchToolbar.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import PopularPlantList from '@/pages/index/components/PopularPlantList.vue'
import diagnoseToolIcon from '@/assets/icons/home-tool-diagnose.svg'
import wateringToolIcon from '@/assets/icons/home-tool-watering.svg'
import identifyToolIcon from '@/assets/icons/home-tool-identify.svg'
import { createDebounced, createLeadingThrottle } from '@/utils/interaction-guard.js'
import { requireMvpAccess } from '@/utils/subscription-access.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isDiagnosisAvailable, isFeatureAvailable } from '@/utils/platform-capabilities.js'
import { useUserStore } from '@/store/user.js'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import { useUserPlantIdentify } from '@/composables/useUserPlantIdentify.js'
import {
  getPlantDisplayName,
  selectPopularIndoorPlants
} from '@/pages/index/components/popular-indoor-plants.js'
import { computed, onBeforeUnmount, ref } from 'vue'

const TOOL_ACTION_THROTTLE_MS = 500
const HOME_PLANT_CATALOG_PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300
const HOME_IDENTIFY_INITIAL_STEP = 0
const userStore = useUserStore()
const homeSearchKeyword = ref('')
const homeSearchFocused = ref(false)
const {
  plants: homeCatalogPlants,
  loading: homePlantsLoading,
  load: loadHomeCatalogPlants
} = useDefaultPlants({ pageSize: HOME_PLANT_CATALOG_PAGE_SIZE })
const homeSearchResults = computed(() =>
  selectPopularIndoorPlants(homeCatalogPlants.value, homeSearchKeyword.value)
)
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()
const homeIdentifyFormData = ref({ image: '', imageFileId: '' })
const homeIdentifySelectedPlant = ref(null)
const homeRecognizedName = ref('')
const homeIdentifyContext = ref(null)
const homeIdentifyActiveStep = ref(HOME_IDENTIFY_INITIAL_STEP)
const homeAiDialogVisible = ref(false)
const homeAiDialogRef = ref(null)
const {
  useAIIdentify: runHomeAiIdentify,
  handleAIConfirm: handleHomeAIResultConfirm,
  handleAIRetry: handleHomeAiRetry,
  handleAIClose: handleHomeAiClose,
  clearPendingImage: clearHomePendingImage
} = useUserPlantIdentify({
  userStore,
  defaultPlants: homeCatalogPlants,
  formData: homeIdentifyFormData,
  selectedPlant: homeIdentifySelectedPlant,
  recognizedName: homeRecognizedName,
  identifyContext: homeIdentifyContext,
  showAIDialog: homeAiDialogVisible,
  aiDialogRef: homeAiDialogRef,
  activeStep: homeIdentifyActiveStep,
  openFeatureUnavailable,
  onSelectionApplied: handleHomeIdentifySelection
})

function openDiagnosisTool() {
  if (!isDiagnosisAvailable('home_tool')) {
    openFeatureUnavailable('diagnosis')
    return
  }
  uni.switchTab({ url: '/pages/diagnose/diagnose' })
}

async function openWateringTool() {
  if (!isFeatureAvailable('watering')) {
    openFeatureUnavailable('watering')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'home_watering_tool' }))) {
    return
  }
  uni.navigateTo({ url: '/subpackages/care/watering-advisor/watering-advisor' })
}

async function openIdentifyTool() {
  await runHomeAiIdentify()
}

function addPlant() {
  uni.navigateTo({ url: '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create' })
}

function openAddPlantFromHomeSearch() {
  addPlant()
}

function handleHomeAiConfirm(result) {
  handleHomeAIResultConfirm(result)
}

function handleHomeIdentifySelection(identifyResult) {
  uni.navigateTo({
    url: '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create&entrySource=home_ai_identify',
    success: navigation => {
      navigation.eventChannel?.emit('home-ai-identify-result', identifyResult)
    }
  })
}

async function loadHomePlants(keyword = '') {
  await loadHomeCatalogPlants(keyword)
}

function handleHomeSearchFocus() {
  const wasFocused = homeSearchFocused.value
  homeSearchFocused.value = true
  if (!wasFocused) {
    loadHomePlants(homeSearchKeyword.value)
  }
}

function handleHomeSearchClear() {
  homeSearchKeyword.value = ''
  debouncedSearchPlants('')
}

function handleHomeSearchCancel() {
  homeSearchFocused.value = false
  homeSearchKeyword.value = ''
  debouncedSearchPlants.cancel()
}

async function handleHomePlantSelect(plant) {
  const plantId = String(plant?.id || plant?.plantId || plant?.sessionPlantId || '').trim()
  if (!plantId || !(await userStore.ensureLogin({ prompt: true }))) {
    return
  }
  uni.navigateTo({
    url: `/subpackages/plant/catalog-detail/catalog-detail?plantId=${encodeURIComponent(plantId)}`
  })
}

async function openHomeAiIdentify() {
  await runHomeAiIdentify()
}

const handleOpenDiagnosisTool = createLeadingThrottle(openDiagnosisTool, TOOL_ACTION_THROTTLE_MS)
const handleOpenWateringTool = createLeadingThrottle(openWateringTool, TOOL_ACTION_THROTTLE_MS)
const handleOpenIdentifyTool = createLeadingThrottle(openIdentifyTool, TOOL_ACTION_THROTTLE_MS)
const handleHomeAiIdentify = createLeadingThrottle(openHomeAiIdentify, TOOL_ACTION_THROTTLE_MS)
const debouncedSearchPlants = createDebounced(
  keyword => loadHomePlants(keyword),
  SEARCH_DEBOUNCE_MS
)
const handleHomeSearchInput = value => {
  homeSearchKeyword.value = value
  if (!homeSearchFocused.value) {
    homeSearchFocused.value = true
  }
  debouncedSearchPlants(value)
}
const handleHomeSearchConfirm = createLeadingThrottle(
  openAddPlantFromHomeSearch,
  TOOL_ACTION_THROTTLE_MS
)

// 首页搜索使用 trailing 防抖，避免连续输入时重复请求目录接口。
onBeforeUnmount(() => {
  debouncedSearchPlants.cancel()
  clearHomePendingImage().catch(() => {})
})
</script>
