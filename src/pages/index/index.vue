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
          :use-tropicals="true"
          :tropicals-limit="HOME_SEARCH_RESULT_LIMIT"
          :show-cancel="homeSearchFocused"
          :search-keyword="homeSearchKeyword"
          @focus="handleHomeSearchFocus"
          @update:search-keyword="handleHomeSearchInput"
          @search-confirm="handleHomeSearchConfirm"
          @clear-search="handleHomeSearchClear"
          @cancel-search="handleHomeSearchCancel"
          @ai-identify="handleHomeAiIdentify"
          @results="handleHomeSearchResults"
          @loading="handleHomeSearchLoading"
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
            >智能绿植养护神器</text
          >
          <!-- Open-Meteo 辐射实验：轻量调试行，不改首页布局结构 -->
          <text
            v-if="radiationDebugLine"
            class="mt-2 block text-center text-[11px] leading-4 tracking-[-0.15px] text-[#8aa396]"
            >{{ radiationDebugLine }}</text
          >

          <!-- 竖窗位置光照：区间 + DLI；户外全天空仅作次要参考 -->
          <view
            id="index-outdoor-light-estimate"
            class="mt-4 w-full overflow-hidden rounded-2xl border border-[rgba(45,122,79,0.15)] bg-white p-3 shadow-[0_1px_1.5px_rgba(0,0,0,0.1),0_1px_1px_rgba(0,0,0,0.1)]"
          >
            <view class="flex items-start justify-between gap-2">
              <view class="min-w-0 flex-1">
                <text class="block text-sm font-semibold leading-5 text-[#0a0a0a]"
                  >窗边位置光照（实验）</text
                >
                <text class="mt-0.5 block text-[11px] leading-4 text-[#8aa396]"
                  >竖窗/户外模型 · 实时 Open-Meteo · 非计量</text
                >
              </view>
              <text
                id="index-open-meteo-refresh"
                class="shrink-0 rounded-full border border-[rgba(45,122,79,0.2)] bg-white px-2.5 py-1 text-[11px] leading-4 text-[#2d7a4f]"
                :class="openMeteoRefreshing ? 'opacity-50' : ''"
                @click="handleRefreshOpenMeteo"
                >{{ openMeteoRefreshing ? '更新中…' : '刷新辐射' }}</text
              >
            </view>

            <!-- 站点偏好：朝向 / 距离 / 遮挡 / 纱帘 -->
            <view class="mt-2 rounded-xl bg-[#f5faf6] p-2">
              <text class="block text-[11px] font-medium leading-4 text-[#0a0a0a]">种植位置</text>
              <view class="mt-1.5 flex flex-wrap gap-1.5">
                <text
                  v-for="opt in windowFacingOptions"
                  :key="'face-' + opt.key"
                  class="rounded-full px-2.5 py-1 text-[11px] leading-4"
                  :class="
                    sitePrefs.windowFacing === opt.key
                      ? 'bg-[#2d7a4f] text-white'
                      : 'bg-white text-[#5a7a68] border border-[rgba(45,122,79,0.2)]'
                  "
                  @click="updateSitePref('windowFacing', opt.key)"
                  >{{ opt.label }}窗</text
                >
              </view>
              <view class="mt-1.5 flex flex-wrap gap-1.5">
                <text
                  v-for="opt in distanceBandOptions"
                  :key="'dist-' + opt.key"
                  class="rounded-full px-2.5 py-1 text-[11px] leading-4"
                  :class="
                    sitePrefs.distanceBand === opt.key
                      ? 'bg-[#2d7a4f] text-white'
                      : 'bg-white text-[#5a7a68] border border-[rgba(45,122,79,0.2)]'
                  "
                  @click="updateSitePref('distanceBand', opt.key)"
                  >{{ opt.label }}</text
                >
              </view>
              <view class="mt-1.5 flex flex-wrap gap-1.5">
                <text
                  v-for="opt in obstructionOptions"
                  :key="'obs-' + opt.key"
                  class="rounded-full px-2.5 py-1 text-[11px] leading-4"
                  :class="
                    sitePrefs.obstruction === opt.key
                      ? 'bg-[#2d7a4f] text-white'
                      : 'bg-white text-[#5a7a68] border border-[rgba(45,122,79,0.2)]'
                  "
                  @click="updateSitePref('obstruction', opt.key)"
                  >{{ opt.label }}</text
                >
                <text
                  class="rounded-full px-2.5 py-1 text-[11px] leading-4"
                  :class="
                    sitePrefs.hasScreen
                      ? 'bg-[#2d7a4f] text-white'
                      : 'bg-white text-[#5a7a68] border border-[rgba(45,122,79,0.2)]'
                  "
                  @click="updateSitePref('hasScreen', !sitePrefs.hasScreen)"
                  >{{ sitePrefs.hasScreen ? '有纱帘' : '无纱帘' }}</text
                >
              </view>
            </view>

            <view class="mt-2 flex items-baseline justify-between gap-2">
              <text class="text-xl font-semibold tabular-nums text-[#2d7a4f]">
                {{ positionLuxRangeDisplay }}
              </text>
              <text class="text-xs tabular-nums text-[#5a7a68]">{{ positionTierLabel }}</text>
            </view>
            <text class="mt-0.5 block text-[11px] leading-4 text-[#8aa396]">{{
              positionPpfdRangeDisplay
            }}</text>
            <text class="mt-1 block text-xs font-medium leading-4 text-[#1a5c38]">{{
              dliDisplay
            }}</text>
            <text class="mt-0.5 block text-[11px] leading-4 text-[#8aa396]">{{
              positionModelNote
            }}</text>
            <text
              v-if="cameraWarning"
              class="mt-1 block text-[11px] leading-4 text-[#c45c26]"
              >{{ cameraWarning }}</text
            >

            <!-- 现场校准：同位置、无直射时输入其他测光 App 读数 -->
            <view class="mt-2 flex items-center gap-1.5">
              <input
                id="index-site-calibration-input"
                class="h-7 min-w-0 flex-1 rounded-lg border border-[rgba(45,122,79,0.2)] bg-white px-2 text-[12px] text-[#0a0a0a]"
                type="digit"
                placeholder="参考读数 lux（同位置·无直射）"
                :value="calibrationInput"
                @input="handleCalibrationInput"
              />
              <text
                class="rounded-full bg-[#2d7a4f] px-2.5 py-1 text-[11px] leading-4 text-white"
                @click="handleApplyCalibration"
                >校准</text
              >
              <text
                v-if="sitePrefs.calibrationFactor"
                class="rounded-full border border-[rgba(45,122,79,0.2)] bg-white px-2.5 py-1 text-[11px] leading-4 text-[#5a7a68]"
                @click="handleClearCalibration"
                >清除</text
              >
            </view>
            <text
              v-if="calibrationStatus"
              class="mt-1 block text-[11px] leading-4 text-[#8aa396]"
              >{{ calibrationStatus }}</text
            >

            <view class="mt-2 border-t border-[rgba(45,122,79,0.08)] pt-2">
              <text class="block text-[11px] font-medium leading-4 text-[#0a0a0a]"
                >户外全天空（参考）</text
              >
              <view class="mt-0.5 flex items-baseline justify-between gap-2">
                <text class="text-sm tabular-nums text-[#5a7a68]">
                  {{ outdoorLuxDisplay }} lux
                </text>
                <text class="text-[11px] tabular-nums text-[#8aa396]"
                  >PPFD {{ outdoorPpfdDisplay }}</text
                >
              </view>
            </view>
            <text
              v-if="outdoorLightStatus"
              class="mt-1 block text-[11px] leading-4 text-[#8aa396]"
              >{{ outdoorLightStatus }}</text
            >
          </view>

          <CameraLuxMeter
            ref="cameraLuxMeterRef"
            @sentinel="handleCameraSentinel"
          />

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
import CameraLuxMeter from '@/pages/index/components/CameraLuxMeter.vue'
import diagnoseToolIcon from '@/assets/icons/home-tool-diagnose.svg'
import wateringToolIcon from '@/assets/icons/home-tool-watering.svg'
import identifyToolIcon from '@/assets/icons/home-tool-identify.svg'
import { createLeadingThrottle } from '@/utils/interaction-guard.js'
import { requireMvpAccess } from '@/utils/subscription-access.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isDiagnosisAvailable, isFeatureAvailable } from '@/utils/platform-capabilities.js'
import { useUserStore } from '@/store/user.js'
import { useDefaultPlants } from '@/composables/useDefaultPlants.js'
import { useUserPlantIdentify } from '@/composables/useUserPlantIdentify.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import {
  OPEN_METEO_DEFAULT_LOCATION,
  fetchHourlyRadiation,
  formatRadiationDebugLine
} from '@/api/openMeteo.js'
import {
  estimateOutdoorLightFromShortwave,
  formatOutdoorLightEstimateLine
} from '@/utils/outdoor-light-estimate.js'
import {
  DISTANCE_BAND_OPTIONS,
  OBSTRUCTION_OPTIONS,
  WINDOW_FACING_OPTIONS,
  buildHourlyRadiationSamples,
  computeSiteCalibrationFactor,
  estimateDailyDliFromHourly,
  estimateWindowDaylight,
  formatDliLine,
  shouldUpdateDisplayedLuxRange,
  toSignificantDigits
} from '@/utils/window-daylight-model.js'
import {
  SITE_CALIBRATION_BOUND_KEYS,
  readSiteDaylightPrefs,
  saveSiteDaylightPrefs
} from '@/utils/site-daylight-prefs.js'

const TOOL_ACTION_THROTTLE_MS = 500
const HOME_PLANT_CATALOG_PAGE_SIZE = 50
const HOME_SEARCH_RESULT_LIMIT = 5
const HOME_IDENTIFY_INITIAL_STEP = 0
const userStore = useUserStore()
const homeSearchKeyword = ref('')
const homeSearchFocused = ref(false)
const homeSearchResults = ref([])
const homePlantsLoading = ref(false)
const {
  plants: homeCatalogPlants,
  load: loadHomeCatalogPlants
} = useDefaultPlants({ pageSize: HOME_PLANT_CATALOG_PAGE_SIZE })
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
const radiationDebugLine = ref('')
const outdoorLightEstimate = ref(null)
const outdoorLightStatus = ref('等待定位与辐射数据…')
const radiationSnapshot = ref(null)
const dliResult = ref(null)
const cameraLuxMeterRef = ref(null)
const windowFacingOptions = WINDOW_FACING_OPTIONS
const distanceBandOptions = DISTANCE_BAND_OPTIONS
const obstructionOptions = OBSTRUCTION_OPTIONS
const sitePrefs = ref(readSiteDaylightPrefs())
/** 摄像头双端哨兵：direct / low_light / blocked / neutral，无中间衰减系数 */
const cameraSentinel = ref({
  enabled: false,
  sentinel: null,
  tier: null,
  label: null,
  boostSunPatch: false,
  forceDeepDf: false,
  warning: null,
  smoothedFrameMean: null,
  updatedAt: 0
})
const calibrationInput = ref('')
const calibrationStatus = ref('')
/** Open-Meteo 自动刷新：冷却与页内轮询（实验期偏短，保证读数跟天气走） */
const OPEN_METEO_REFRESH_COOLDOWN_MS = 2 * 60 * 1000
const OPEN_METEO_POLL_INTERVAL_MS = 3 * 60 * 1000
const openMeteoRefreshing = ref(false)
let openMeteoFetchInFlight = false
let openMeteoLastFetchedAt = 0
let openMeteoLastLocationKey = ''
let openMeteoDidToastOnce = false
let openMeteoPollTimer = null

const outdoorLuxDisplay = computed(() => {
  const lux = outdoorLightEstimate.value?.lux
  if (lux === null || lux === undefined) return '--'
  return String(Math.round(lux))
})
const outdoorPpfdDisplay = computed(() => {
  const ppfd = outdoorLightEstimate.value?.ppfd
  if (ppfd === null || ppfd === undefined) return '--'
  return String(Math.round(ppfd))
})

const positionEstimate = computed(() => {
  const snap = radiationSnapshot.value
  if (!snap) return null
  const prefs = sitePrefs.value
  const cam = cameraSentinel.value
  // 显式依赖 updatedAt，避免同态字段变更时 UI 不刷新
  void cam.updatedAt
  const sentinel = cam.enabled ? cam.sentinel || 'neutral' : 'neutral'
  return estimateWindowDaylight(
    buildPositionModelInput(snap, prefs, {
      cameraSentinel: sentinel,
      cameraFrameMean: cam.enabled ? cam.smoothedFrameMean : null
    })
  )
})

function buildPositionModelInput(snap, prefs, overrides = {}) {
  return {
    dhi: snap.dhi,
    dni: snap.dni,
    ghi: snap.ghi,
    cloudCover: snap.cloudCover,
    windowFacing: prefs.windowFacing,
    distanceBand: prefs.distanceBand,
    obstruction: prefs.obstruction,
    hasScreen: prefs.hasScreen,
    siteMode: prefs.siteMode,
    calibrationFactor: prefs.calibrationFactor,
    latitude: snap.latitude,
    longitude: snap.longitude,
    // 太阳几何用「此刻」；辐射值用最新拉到的 Open-Meteo 样本，不把样本时间戳当太阳位置
    when: new Date(),
    ...overrides
  }
}

/** UI 防抖展示：相对变化 >~30% 或档位/站点变化才刷新数字 */
const displayedPositionEstimate = ref(null)
watch(
  positionEstimate,
  next => {
    if (shouldUpdateDisplayedLuxRange(displayedPositionEstimate.value, next)) {
      displayedPositionEstimate.value = next
    }
  },
  { immediate: true }
)

const positionLuxRangeDisplay = computed(() => {
  const est = displayedPositionEstimate.value
  if (!est) return '-- lux'
  return `${toSignificantDigits(est.luxLow, 2)}–${toSignificantDigits(est.luxHigh, 2)} lux`
})
const positionPpfdRangeDisplay = computed(() => {
  const est = displayedPositionEstimate.value
  if (!est) return 'PPFD --'
  return `PPFD ${toSignificantDigits(est.ppfdLow, 2)}–${toSignificantDigits(est.ppfdHigh, 2)} · ${
    est.inSunPatch ? '含太阳斑块' : '散射为主'
  }`
})
const positionTierLabel = computed(() => displayedPositionEstimate.value?.tierLabel || '—')
const dliDisplay = computed(() =>
  formatDliLine(dliResult.value?.dliEstimate, dliResult.value?.limitation)
)
const cameraWarning = computed(() => {
  if (!cameraSentinel.value.enabled) return ''
  const hints = positionEstimate.value?.uiHints
  if (Array.isArray(hints) && hints.length) return hints[0]
  return cameraSentinel.value.warning || ''
})
const positionModelNote = computed(() => {
  const est = positionEstimate.value
  if (!est) return '等待辐射与窗位设置…'
  const f = est.factors
  const cam = cameraSentinel.value.enabled
    ? cameraSentinel.value.label || '哨兵开启'
    : '未开摄像头 · 仅模型'
  const calib = f.calibrationFactor
    ? `已现场校准 ×${toSignificantDigits(f.calibrationFactor, 2)}`
    : '未标定'
  if (f.siteMode === 'outdoor') {
    return `户外全天空 · ${cam} · ${calib}`
  }
  return `DF ${f.dfLow.toFixed(3)}–${f.dfHigh.toFixed(3)} · glassT ${f.glassT} · ${f.windowFacing}窗 · ${cam} · ${calib}`
})

function handleCalibrationInput(event) {
  calibrationInput.value = String(event?.detail?.value ?? '')
}

/** 以未校准、摄像头中性的模型值为分母，求站点系数；先强制拉最新辐射再算 */
async function handleApplyCalibration() {
  calibrationStatus.value = '正在拉取最新辐射…'
  await runOpenMeteoRadiationExperiment({ force: true })
  const snap = radiationSnapshot.value
  if (!snap) {
    calibrationStatus.value = '尚未拿到辐射数据，稍后再试'
    return
  }
  const uncalibrated = estimateWindowDaylight(
    buildPositionModelInput(snap, sitePrefs.value, {
      calibrationFactor: null,
      cameraSentinel: 'neutral',
      cameraFrameMean: null
    })
  )
  const result = computeSiteCalibrationFactor(Number(calibrationInput.value), uncalibrated)
  if (!result.ok) {
    calibrationStatus.value = result.reason
    return
  }
  sitePrefs.value = saveSiteDaylightPrefs({ ...sitePrefs.value, calibrationFactor: result.factor })
  calibrationStatus.value = result.clamped
    ? `系数超出合理范围，已截断为 ×${toSignificantDigits(result.factor, 2)}，请核对位置选项或参考读数`
    : `已校准：模型散射项 ×${toSignificantDigits(result.factor, 2)}（换位置会自动清除）`
  displayedPositionEstimate.value = null
  recomputeDli()
}

function handleRefreshOpenMeteo() {
  if (openMeteoFetchInFlight) return
  runOpenMeteoRadiationExperiment({ force: true })
}

function startOpenMeteoPolling() {
  stopOpenMeteoPolling()
  openMeteoPollTimer = setInterval(() => {
    runOpenMeteoRadiationExperiment({ force: true })
  }, OPEN_METEO_POLL_INTERVAL_MS)
}

function stopOpenMeteoPolling() {
  if (openMeteoPollTimer) {
    clearInterval(openMeteoPollTimer)
    openMeteoPollTimer = null
  }
}

function handleClearCalibration() {
  sitePrefs.value = saveSiteDaylightPrefs({ ...sitePrefs.value, calibrationFactor: null })
  calibrationStatus.value = '已清除现场校准'
  displayedPositionEstimate.value = null
  recomputeDli()
}

function recomputeDli() {
  const snap = radiationSnapshot.value
  if (!snap?.hourlySamples?.length) {
    dliResult.value = null
    return
  }
  dliResult.value = estimateDailyDliFromHourly(snap.hourlySamples, sitePrefs.value, {
    latitude: snap.latitude,
    longitude: snap.longitude,
    useInstantNote: Boolean(snap.hasShortwaveInstant)
  })
}

function updateSitePref(key, value) {
  const next = { ...sitePrefs.value, [key]: value }
  if (key === 'distanceBand') {
    next.siteMode = value === 'outdoor' ? 'outdoor' : 'indoor'
  }
  if (SITE_CALIBRATION_BOUND_KEYS.includes(key) && next.calibrationFactor) {
    next.calibrationFactor = null
    calibrationStatus.value = '位置已变化，现场校准已清除'
  }
  sitePrefs.value = saveSiteDaylightPrefs(next)
  // 站点变更立即刷新展示，跳过 lux 防抖
  displayedPositionEstimate.value = null
  recomputeDli()
}

function handleCameraSentinel(payload) {
  // 整对象替换，保证 positionEstimate / cameraWarning 等 computed 随哨兵态刷新
  cameraSentinel.value = {
    enabled: Boolean(payload?.enabled),
    sentinel: payload?.sentinel ?? payload?.tier ?? null,
    tier: payload?.sentinel ?? payload?.tier ?? null,
    label: payload?.label ?? null,
    boostSunPatch: Boolean(payload?.boostSunPatch),
    forceDeepDf: Boolean(payload?.forceDeepDf),
    warning: payload?.warning ?? null,
    smoothedFrameMean: Number.isFinite(Number(payload?.smoothedFrameMean))
      ? Number(payload.smoothedFrameMean)
      : null,
    updatedAt: Date.now()
  }
}
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

function handleHomeSearchResults(list) {
  homeSearchResults.value = Array.isArray(list) ? list : []
}

function handleHomeSearchLoading(value) {
  homePlantsLoading.value = Boolean(value)
}

function handleHomeSearchFocus() {
  const wasFocused = homeSearchFocused.value
  homeSearchFocused.value = true
  if (!wasFocused) {
    // 搜索建议由 PlantSearchToolbar（useTropicals）发起；目录仍预热供首页 AI 识别匹配。
    loadHomeCatalogPlants('').catch(() => {})
  }
}

function handleHomeSearchClear() {
  homeSearchKeyword.value = ''
}

function handleHomeSearchCancel() {
  homeSearchFocused.value = false
  homeSearchKeyword.value = ''
  homeSearchResults.value = []
  homePlantsLoading.value = false
}

async function handleHomePlantSelect(plant) {
  // Tropicals 详情按 slug 取数；列表项 id 已映射为 slug。
  const plantId = String(plant?.slug || plant?.id || plant?.plantId || '').trim()
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
const handleHomeSearchInput = value => {
  homeSearchKeyword.value = value
  if (!homeSearchFocused.value) {
    homeSearchFocused.value = true
  }
}
const handleHomeSearchConfirm = createLeadingThrottle(
  openAddPlantFromHomeSearch,
  TOOL_ACTION_THROTTLE_MS
)

function resolveOpenMeteoExperimentLocation() {
  const stored = userStore?.location || {}
  const latitude = Number(stored.latitude)
  const longitude = Number(stored.longitude)
  if (Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)) {
    return {
      latitude,
      longitude,
      source: 'userStore'
    }
  }
  return {
    latitude: OPEN_METEO_DEFAULT_LOCATION.latitude,
    longitude: OPEN_METEO_DEFAULT_LOCATION.longitude,
    source: 'default-shanghai'
  }
}

function buildOpenMeteoLocationKey(location) {
  return `${Number(location.latitude).toFixed(4)},${Number(location.longitude).toFixed(4)}`
}

/**
 * 拉取最新 Open-Meteo 辐射并重算位置光照。
 * 触发：首次 / 定位变化 / 冷却到期 / 页内轮询 / 手动「刷新辐射」/ 校准前。
 * 辐射数值从不写死，每次 force 或到期都会打网；定位来自 userStore 或默认上海坐标。
 */
async function runOpenMeteoRadiationExperiment({ force = false } = {}) {
  if (openMeteoFetchInFlight) {
    return
  }
  const location = resolveOpenMeteoExperimentLocation()
  const locationKey = buildOpenMeteoLocationKey(location)
  const now = Date.now()
  const locationChanged = locationKey !== openMeteoLastLocationKey
  const cooledDown = now - openMeteoLastFetchedAt >= OPEN_METEO_REFRESH_COOLDOWN_MS
  if (!force && openMeteoLastFetchedAt > 0 && !locationChanged && !cooledDown) {
    return
  }

  openMeteoFetchInFlight = true
  openMeteoRefreshing.value = true
  outdoorLightStatus.value = location.source === 'userStore' ? '正在更新户外估算…' : '使用默认上海坐标估算…'
  try {
    const result = await fetchHourlyRadiation({
      latitude: location.latitude,
      longitude: location.longitude
    })
    const line = formatRadiationDebugLine(result)
    radiationDebugLine.value = line

    const estimate = estimateOutdoorLightFromShortwave(result.ghi, {
      directWm2: result.directHorizontal,
      diffuseWm2: result.dhi
    })
    outdoorLightEstimate.value = estimate
    const sampleTime = result.current?.time ? String(result.current.time) : ''
    const hourlySamples = buildHourlyRadiationSamples(result.rawHourly)
    radiationSnapshot.value = {
      dhi: result.dhi,
      dni: result.dni,
      ghi: result.ghi,
      cloudCover: result.cloudCover,
      latitude: result.latitude,
      longitude: result.longitude,
      sampleTime,
      fetchedAt: result.fetchedAt || new Date().toISOString(),
      currentSource: result.currentSource || null,
      hourlySamples,
      hasShortwaveInstant: Boolean(result.hasShortwaveInstant)
    }
    // 新辐射到了就允许 UI 立刻换数字，跳过相对变化防抖
    displayedPositionEstimate.value = null
    recomputeDli()
    const fetchedClock = result.fetchedAt
      ? new Date(result.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : ''
    outdoorLightStatus.value = [
      formatOutdoorLightEstimateLine(estimate),
      sampleTime ? `样本 ${sampleTime}` : '',
      fetchedClock ? `拉取 ${fetchedClock}` : '',
      location.source === 'userStore' ? '定位: 已用设备位置' : '定位: 默认上海（未授权或无坐标）',
      result.radiationLimitation || ''
    ]
      .filter(Boolean)
      .join(' · ')

    openMeteoLastFetchedAt = Date.now()
    openMeteoLastLocationKey = locationKey

    const pos = positionEstimate.value
    console.log('[OpenMeteo实验]', {
      location,
      timezone: result.timezone,
      fetchedAt: result.fetchedAt,
      currentSource: result.currentSource,
      time: result.current?.time,
      ghi: result.ghi,
      dni: result.dni,
      dhi: result.dhi,
      directHorizontal: result.directHorizontal,
      maxGhiToday: result.maxGhiToday,
      outdoorEstimate: estimate,
      positionEstimate: pos,
      dli: dliResult.value,
      sitePrefs: sitePrefs.value,
      note: '辐射实时拉取；当前优先 15 分钟序列；DLI 仍用小时序列'
    })

    if (!openMeteoDidToastOnce) {
      openMeteoDidToastOnce = true
      const toastTitle = pos
        ? `位置约 ${toSignificantDigits(pos.luxLow, 2)}–${toSignificantDigits(pos.luxHigh, 2)} lux`
        : `户外 ~${toSignificantDigits(estimate.lux, 2)} lux`
      uni.showToast({
        title: toastTitle,
        icon: 'none',
        duration: 1800
      })
    }
  } catch (error) {
    console.warn('[OpenMeteo实验] 请求失败', error)
    radiationDebugLine.value = '辐射: 获取失败（见控制台）'
    outdoorLightStatus.value = '户外估算获取失败（见控制台）'
  } finally {
    openMeteoFetchInFlight = false
    openMeteoRefreshing.value = false
  }
}

onMounted(() => {
  runOpenMeteoRadiationExperiment({ force: true })
  startOpenMeteoPolling()
})

onShow(() => {
  // 回前台：定位变化或冷却到期时刷新；并确保轮询在跑
  runOpenMeteoRadiationExperiment()
  startOpenMeteoPolling()
})

onHide(() => {
  stopOpenMeteoPolling()
})

onBeforeUnmount(() => {
  stopOpenMeteoPolling()
  clearHomePendingImage().catch(() => {})
  cameraLuxMeterRef.value?.stopMeter?.()
})
</script>
