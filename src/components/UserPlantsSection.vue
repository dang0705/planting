<template>
  <view id="garden-my-plants-section" class="px-4 pb-6">
    <view class="mb-3 flex items-end justify-between">
      <view>
        <text class="block text-lg font-bold text-gray-900">我的植物</text>
        <text
          v-if="userStore.isAuthenticated && plantStore.hasPlants"
          class="mt-1 block text-xs text-gray-500"
        >
          共 {{ plantStore.userPlants.length }} 株植物
        </text>
      </view>
      <view
        v-if="userStore.isAuthenticated && !loadingPlants && !plantsError && plantStore.hasPlants"
        id="garden-my-plants-add-button"
        class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary active:bg-[#eef3ef]"
        @click="handleAddPlant"
      >
        <uni-icons type="plusempty" size="14" color="#2d7a4f" />
        <text>添加植物</text>
      </view>
    </view>

    <view
      v-if="!userStore.isAuthenticated"
      id="garden-my-plants-login-state"
      class="rounded-2xl bg-white p-5 shadow-sm"
    >
      <text class="block text-base font-semibold text-gray-900">登录后管理你的植物</text>
      <text class="mt-2 block text-sm leading-6 text-gray-500"
        >登录后可添加植物、查看诊断记录和设置养护提醒。</text
      >
      <button
        id="garden-my-plants-phone-login-button"
        class="mt-4 w-full rounded-2xl bg-primary py-3.5 text-white"
        :class="{ 'opacity-60': phoneLoggingIn }"
        :disabled="phoneLoggingIn"
        :loading="phoneLoggingIn"
        @click="handlePhoneLoginRequest"
      >
        {{ phoneLoggingIn ? '登录中…' : '手机号登录' }}
      </button>
    </view>

    <template v-else>
      <view
        v-if="plantStore.plantsNeedWater.length"
        id="garden-my-plants-needing-water-summary"
        class="mb-4 rounded-2xl bg-[#FFF3E0] px-4 py-3"
      >
        <text class="text-sm font-semibold text-[#F57C00]">
          今日需要浇水 {{ plantStore.plantsNeedWater.length }} 株植物
        </text>
      </view>
      <view v-if="loadingPlants" id="garden-my-plants-loading-skeleton" class="space-y-4">
        <view
          v-for="skeletonIndex in 2"
          :key="skeletonIndex"
          class="flex h-[129px] animate-pulse overflow-hidden rounded-[12px] border border-[rgba(45,122,79,0.15)] bg-white p-px shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]"
        >
          <view class="h-[127px] w-[112px] flex-[0_0_112px] bg-gray-200" />
          <view class="flex h-[127px] min-w-0 flex-1 flex-col gap-2 p-3">
            <view class="h-[27px] w-32 rounded bg-gray-200" />
            <view class="h-[22px] w-20 rounded-full bg-gray-100" />
            <view class="flex h-[38px] min-w-0 w-full gap-2">
              <view class="h-9 min-w-0 w-0 flex-1 rounded-[10px] bg-gray-200" />
              <view class="h-9 min-w-0 w-0 flex-1 rounded-[10px] bg-gray-100" />
            </view>
          </view>
          <view
            class="flex h-[127px] w-[49px] flex-[0_0_49px] flex-col items-center justify-center gap-2 border-l border-[rgba(45,122,79,0.15)] py-3 pl-[9px] pr-2"
          >
            <view class="size-8 rounded-full bg-gray-100" />
            <view class="size-8 rounded-full bg-gray-100" />
          </view>
        </view>
      </view>

      <view
        v-else-if="plantsError"
        id="garden-my-plants-error"
        class="flex flex-col items-center rounded-2xl bg-white px-8 py-10 text-center"
      >
        <text class="text-4xl">🌿</text>
        <text class="mt-4 text-base font-semibold text-gray-800">植物暂时加载失败</text>
        <text class="mt-2 text-sm leading-6 text-gray-400">请检查网络后再试一次</text>
        <button
          id="garden-my-plants-retry-button"
          class="mt-5 rounded-3xl bg-primary px-8 py-3.5 text-white"
          @click="loadUserPlants()"
        >
          重新加载
        </button>
      </view>

      <view
        v-else-if="!plantStore.hasPlants"
        id="garden-my-plants-empty"
        class="flex flex-col items-center rounded-2xl bg-white px-8 py-10 text-center"
      >
        <text class="text-5xl">🌱</text>
        <text class="mt-4 text-base font-semibold text-gray-800">还没有添加植物</text>
        <text class="mt-2 text-sm leading-6 text-gray-400"
          >记录你的每一株植物，方便持续查看养护建议</text
        >
        <button
          id="garden-my-plants-empty-add-button"
          class="mt-5 rounded-3xl bg-primary px-8 py-3.5 text-white"
          @click="handleAddPlant"
        >
          添加第一株植物
        </button>
      </view>

      <view v-else id="garden-my-plants-list">
        <view
          v-for="plant in plantStore.userPlants"
          :key="plant.id"
          :id="`profile-my-plant-${plant.id}`"
          class="mb-4 rounded-3xl bg-white shadow-sm"
        >
          <PlantCard
            id-prefix="garden-my-plants"
            :plant="plant"
            :reminder-summary="getReminderSummary(plant)"
            @diagnose="openDiagnose"
            @history="togglePlantHistory"
            @edit="openEditPlant"
            @reminder="openReminder"
            @fertilization="openFertilization"
          />
          <view
            v-if="plantDiagnoseHistory[plant.id]"
            :id="`garden-my-plants-history-list-${plant.id}`"
            class="diagnosis-history-shell overflow-hidden rounded-b-3xl border-t border-[#e7f0e9] bg-[#f5f9f5]"
            :class="{
              'diagnosis-history-shell--expanded': plantDiagnoseHistoryExpanded[plant.id]
            }"
          >
            <view
              :id="`garden-my-plants-history-toggle-${plant.id}`"
              class="diagnosis-history-toggle flex min-h-[44px] items-center justify-between px-3 py-2"
              hover-class="diagnosis-history-toggle--pressed"
              :aria-expanded="Boolean(plantDiagnoseHistoryExpanded[plant.id])"
              :aria-label="plantDiagnoseHistoryExpanded[plant.id] ? '收起诊断历史' : '展开诊断历史'"
              @click="togglePlantHistory(plant)"
            >
              <view class="min-w-0">
                <text class="block text-sm font-semibold leading-5 text-[#173b28]">诊断历史</text>
                <text class="mt-0.5 block text-[10px] leading-4 text-[#789080]">
                  {{
                    plantDiagnoseHistory[plant.id].length
                      ? `最近 ${plantDiagnoseHistory[plant.id].length} 条 · 左右滑动`
                      : '暂无记录'
                  }}
                </text>
              </view>
              <view class="flex min-h-[36px] items-center gap-2 pl-3">
                <text class="text-xs font-medium text-[#2f6b42]">
                  {{ plantDiagnoseHistoryExpanded[plant.id] ? '收起' : '展开' }}
                </text>
                <view class="diagnosis-history-chevron" aria-hidden="true" />
              </view>
            </view>

            <view
              :id="`garden-my-plants-history-panel-${plant.id}`"
              class="diagnosis-history-panel"
              :class="{
                'diagnosis-history-panel--collapsed': !plantDiagnoseHistoryExpanded[plant.id]
              }"
              :aria-hidden="!plantDiagnoseHistoryExpanded[plant.id]"
            >
              <view
                v-if="!plantDiagnoseHistory[plant.id].length"
                :id="`garden-my-plants-history-empty-${plant.id}`"
                class="px-1 py-3 text-center"
              >
                <text class="text-xs leading-5 text-[#789080]">还没有这株植物的诊断记录</text>
              </view>

              <scroll-view
                v-else
                :id="`garden-my-plants-history-timeline-${plant.id}`"
                class="diagnosis-history-scroll"
                scroll-x
                show-scrollbar="false"
              >
                <view class="diagnosis-history-track">
                  <view class="diagnosis-history-line" aria-hidden="true" />
                  <view
                    v-for="(record, index) in plantDiagnoseHistory[plant.id]"
                    :key="record.key"
                    class="diagnosis-history-item"
                    :class="{
                      'diagnosis-history-item--visible': plantDiagnoseHistoryExpanded[plant.id]
                    }"
                    :style="{ animationDelay: `${index * HISTORY_ITEM_STAGGER_MS}ms` }"
                  >
                    <view class="diagnosis-history-date">
                      <text class="text-xs font-semibold leading-4 text-[#244c34]">{{
                        record.dateLabel
                      }}</text>
                      <text class="mt-0.5 text-[10px] leading-4 text-[#789080]">{{
                        record.timeLabel
                      }}</text>
                    </view>
                    <view class="diagnosis-history-node-row" aria-hidden="true">
                      <view
                        class="diagnosis-history-node"
                        :class="
                          record.outcomeType === 'problematic' || record.outcomeType === 'problem'
                            ? 'diagnosis-history-node--attention'
                            : record.outcomeType === 'uncertain'
                              ? 'diagnosis-history-node--uncertain'
                              : 'diagnosis-history-node--calm'
                        "
                      />
                    </view>
                    <view
                      :id="`garden-my-plants-diagnose-record-${record.recordId || record.key}`"
                      class="diagnosis-history-card"
                      :class="{ 'diagnosis-history-card--disabled': !record.recordId }"
                      hover-class="diagnosis-history-card--pressed"
                      :aria-label="
                        record.recordId
                          ? `查看${record.dateLabel}的诊断结果：${record.outcomeLabel}`
                          : undefined
                      "
                      @click="viewDiagnoseDetail(record.recordId)"
                    >
                      <text class="block text-sm font-semibold leading-5 text-[#173b28]">
                        {{ record.outcomeLabel }}
                      </text>
                      <view
                        class="mt-1.5 inline-flex rounded-full px-2 py-1"
                        :class="
                          record.outcomeType === 'problematic' || record.outcomeType === 'problem'
                            ? 'bg-[#fff0eb] text-[#a8462f]'
                            : record.outcomeType === 'uncertain'
                              ? 'bg-[#fff7df] text-[#8a6410]'
                              : 'bg-[#e7f4e9] text-[#2f6b42]'
                        "
                      >
                        <text class="text-[10px] font-medium leading-4">{{
                          record.outcomeTypeLabel
                        }}</text>
                      </view>
                      <text class="mt-1.5 block text-[10px] leading-4 text-[#789080]">
                        点击查看详情
                      </text>
                    </view>
                  </view>
                </view>
              </scroll-view>
            </view>
          </view>
        </view>
        <view
          id="garden-my-plants-watering-advisor-entry"
          class="mt-3 flex items-center justify-between rounded-[20px] bg-white p-4 shadow-sm"
          @click="handleGoWateringAdvisor"
        >
          <view class="flex items-center gap-3">
            <text class="text-[24px]">💧</text>
            <view>
              <text class="block text-sm font-semibold text-gray-800">独立浇水建议</text>
              <text class="block text-[11px] text-gray-400">不添加植物也能获取浇水方案</text>
            </view>
          </view>
          <text class="text-[18px] text-gray-300">›</text>
        </view>
      </view>
    </template>

    <WateringReminderSheet
      ref="wateringReminderRef"
      :plant="currentReminderPlant"
      @close="currentReminderPlantId = null"
    />
    <FertilizationMonthlySheet
      ref="fertilizationMonthlyRef"
      :plant="currentFertilizationPlant"
      @close="currentFertilizationPlantId = null"
      @changed="loadUserPlants({ showLoading: false })"
    />
    <FeatureUnavailableModal v-model="featureUnavailableVisible" :feature-key="openedFeatureKey" />
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import { getDiagnosisHistory } from '@/api/diagnosis-history.js'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { createLeadingThrottle } from '@/utils/interaction-guard.js'
import { requireMvpAccess } from '@/utils/subscription-access.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isDiagnosisAvailable, isFeatureAvailable } from '@/utils/platform-capabilities.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { requestPhoneLogin } from '@/utils/phone-login-gate.js'
import { buildDiagnosisHistoryTimelineItems } from '@/utils/diagnosis-history-timeline.js'
import PlantCard from '@/pages/index/components/PlantCard.vue'
import FertilizationMonthlySheet from '@/pages/index/components/FertilizationMonthlySheet.vue'
import WateringReminderSheet from '@/pages/index/components/WateringReminderSheet.vue'

const USER_PLANTS_PAGE = 1
const USER_PLANTS_PAGE_SIZE = 50
const ACTION_THROTTLE_MS = 500
const HISTORY_ITEM_STAGGER_MS = 45

const plantStore = usePlantStore()
const plantingStore = usePlantingStore()
const userStore = useUserStore()
const loadingPlants = ref(true)
const plantsError = ref('')
const requestInFlight = ref(false)
const wateringReminderRef = ref(null)
const fertilizationMonthlyRef = ref(null)
const currentReminderPlantId = ref(null)
const currentFertilizationPlantId = ref(null)
const phoneLoggingIn = ref(false)
const plantDiagnoseHistory = reactive({})
const plantDiagnoseHistoryExpanded = reactive({})
const currentReminderPlant = computed(() =>
  currentReminderPlantId.value === null
    ? null
    : plantStore.userPlants.find(
        plant => Number(plant.id) === Number(currentReminderPlantId.value)
      ) || null
)
const currentFertilizationPlant = computed(() =>
  currentFertilizationPlantId.value === null
    ? null
    : plantStore.userPlants.find(
        plant => Number(plant.id) === Number(currentFertilizationPlantId.value)
      ) || null
)
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()
onMounted(async () => {
  if (await userStore.ensureLogin()) {
    await loadUserPlants()
  } else {
    loadingPlants.value = false
  }
})

function clearPlantDiagnoseHistory() {
  Object.keys(plantDiagnoseHistory).forEach(key => delete plantDiagnoseHistory[key])
  Object.keys(plantDiagnoseHistoryExpanded).forEach(key => delete plantDiagnoseHistoryExpanded[key])
}

async function reload(options = {}) {
  if (!options.preserveDiagnosisHistory) {
    clearPlantDiagnoseHistory()
  }
  return loadUserPlants(options)
}

defineExpose({ reload })

async function loadUserPlants({ showLoading = true } = {}) {
  if (requestInFlight.value) {
    return
  }
  requestInFlight.value = true
  if (showLoading) {
    loadingPlants.value = true
  }
  plantsError.value = ''
  try {
    const result = await plantStore.getUserPlants(USER_PLANTS_PAGE, USER_PLANTS_PAGE_SIZE)
    if (!result?.success && !result?.stale) {
      plantsError.value = result?.message || '暂时无法加载植物，请检查网络后重试'
    }
  } finally {
    requestInFlight.value = false
    loadingPlants.value = false
  }
}

async function handlePhoneLoginRequest() {
  if (phoneLoggingIn.value) {
    return
  }
  phoneLoggingIn.value = true
  try {
    if (await requestPhoneLogin({ message: '登录后可管理你的植物' })) {
      await loadUserPlants()
    }
  } finally {
    phoneLoggingIn.value = false
  }
}

function addPlant() {
  uni.navigateTo({ url: '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create' })
}

const handleAddPlant = createLeadingThrottle(addPlant, ACTION_THROTTLE_MS)
const handleGoWateringAdvisor = createLeadingThrottle(goWateringAdvisor, ACTION_THROTTLE_MS)

async function goWateringAdvisor() {
  if (!isFeatureAvailable('watering')) {
    openFeatureUnavailable('watering')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'profile_my_plants_watering_advisor' }))) {
    return
  }
  uni.navigateTo({ url: '/subpackages/care/watering-advisor/watering-advisor' })
}

function openEditPlant(plant) {
  uni.navigateTo({
    url: `/subpackages/plant/user-plant-detail/user-plant-detail?mode=edit&id=${plant.id}`
  })
}

function getReminderSummary(plant) {
  const backendReminder = normalizeBackendWaterReminder(plant?.wateringReminder)
  const localWater = plantingStore.getPlantReminderState(plant.id, 'water')
  return {
    water: backendReminder || localWater,
    fertilize: {
      active: Boolean(plant?.fertilizationReminder?.active),
      reminder: plant?.fertilizationReminder || null,
      nextTime: plant?.fertilizationReminder?.nextTime || ''
    }
  }
}

function normalizeBackendWaterReminder(reminder) {
  if (!reminder?.nextTime) {
    return null
  }
  const nextTime = new Date(reminder.nextTime)
  if (Number.isNaN(nextTime.getTime()) || nextTime < new Date()) {
    return null
  }
  return {
    active: true,
    reminder: { ...reminder, type: 'water', enabled: true },
    nextTime: reminder.nextTime
  }
}

async function openDiagnose(plant) {
  if (!plant?.id) {
    return
  }
  if (!isDiagnosisAvailable('profile_my_plants')) {
    openFeatureUnavailable('diagnosis')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'profile_my_plants_diagnose' }))) {
    return
  }
  const plantId = encodeURIComponent(String(plant.id))
  const plantCatalogId = plant.plantId
    ? `&plantCatalogId=${encodeURIComponent(String(plant.plantId))}`
    : ''
  const plantName = encodeURIComponent(plant.canonicalName || plant.displayName || '当前植物')
  uni.navigateTo({
    url: `/subpackages/diagnosis/flow?plantId=${plantId}${plantCatalogId}&plantName=${plantName}&entrySource=plant_card`
  })
}

async function togglePlantHistory(plant) {
  if (!isDiagnosisAvailable('profile_my_plants_history')) {
    openFeatureUnavailable('diagnosis')
    return
  }
  if (plantDiagnoseHistory[plant.id]) {
    plantDiagnoseHistoryExpanded[plant.id] = !plantDiagnoseHistoryExpanded[plant.id]
    return
  }
  const result = await getDiagnosisHistory({ plantId: plant.id, page: 1, pageSize: 3 })
  plantDiagnoseHistory[plant.id] = buildDiagnosisHistoryTimelineItems(result?.items || [])
  plantDiagnoseHistoryExpanded[plant.id] = true
}

async function openReminder({ plant, type }) {
  const featureKey = type === 'water' ? 'watering' : 'fertilization'
  if (!isFeatureAvailable(featureKey)) {
    openFeatureUnavailable(featureKey)
    return
  }
  if (!(await requireMvpAccess(userStore, { source: `profile_my_plants_${type}_reminder` }))) {
    return
  }
  if (type === 'water') {
    currentReminderPlantId.value = plant.id
    await nextTick()
    callComponentMethod(wateringReminderRef, 'open')
  }
}

async function openFertilization(plant) {
  if (!isFeatureAvailable('fertilization')) {
    openFeatureUnavailable('fertilization')
    return
  }
  if (
    !(await requireMvpAccess(userStore, { source: 'profile_my_plants_fertilization_reminder' }))
  ) {
    return
  }
  currentFertilizationPlantId.value = plant.id
  await nextTick()
  callComponentMethod(fertilizationMonthlyRef, 'open')
}

function viewDiagnoseDetail(recordId) {
  if (!recordId) {
    return
  }
  uni.navigateTo({
    url: `/subpackages/diagnosis/question-package?id=${encodeURIComponent(String(recordId))}&entrySource=plant_history&mode=history`
  })
}
</script>

<style scoped>
.diagnosis-history-toggle {
  transition: background-color 160ms ease;
}

.diagnosis-history-toggle--pressed {
  background: rgba(45, 122, 79, 0.08);
}

.diagnosis-history-chevron {
  width: 8px;
  height: 8px;
  border-right: 2px solid #2f6b42;
  border-bottom: 2px solid #2f6b42;
  transform: rotate(45deg) translate(-2px, -2px);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.diagnosis-history-shell--expanded .diagnosis-history-chevron {
  transform: rotate(225deg) translate(-2px, -2px);
}

.diagnosis-history-panel {
  box-sizing: border-box;
  max-height: 480px;
  overflow: hidden;
  padding: 0 12px 10px;
  opacity: 1;
  transform: translateY(0) scaleY(1);
  transform-origin: top center;
  transition:
    max-height 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease-out,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.diagnosis-history-panel--collapsed {
  max-height: 0;
  padding-bottom: 0;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px) scaleY(0.98);
}

.diagnosis-history-scroll {
  width: 100%;
  white-space: nowrap;
}

.diagnosis-history-track {
  position: relative;
  display: flex;
  gap: 8px;
  box-sizing: border-box;
  min-width: 100%;
  width: max-content;
  padding: 4px 0 2px;
}

.diagnosis-history-line {
  position: absolute;
  z-index: 0;
  top: 48px;
  right: 78px;
  left: 78px;
  height: 2px;
  background: #c8dfce;
  transform: scaleX(0);
  transform-origin: center;
}

.diagnosis-history-shell--expanded .diagnosis-history-line {
  animation: diagnosis-history-line-draw 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.diagnosis-history-item {
  position: relative;
  z-index: 1;
  flex: 0 0 156px;
  width: 156px;
  white-space: normal;
}

.diagnosis-history-item--visible {
  animation: diagnosis-history-item-enter 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.diagnosis-history-date {
  display: flex;
  height: 32px;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  text-align: center;
}

.diagnosis-history-node-row {
  display: flex;
  height: 20px;
  align-items: center;
  justify-content: center;
}

.diagnosis-history-node {
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 3px solid #f5f9f5;
  border-radius: 999px;
  box-shadow: 0 0 0 1px #2d7a4f;
}

.diagnosis-history-item--visible .diagnosis-history-node {
  animation: diagnosis-history-node-pop 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.diagnosis-history-node--attention {
  background: #d86f52;
  box-shadow: 0 0 0 1px #b9573b;
}

.diagnosis-history-node--uncertain {
  background: #e8b948;
  box-shadow: 0 0 0 1px #b78619;
}

.diagnosis-history-node--calm {
  background: #4e9a63;
}

.diagnosis-history-card {
  min-height: 104px;
  box-sizing: border-box;
  margin-top: 6px;
  padding: 10px;
  border: 1px solid #e0ebe2;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(45, 122, 79, 0.08);
  transition:
    transform 160ms ease,
    background-color 160ms ease;
}

.diagnosis-history-card--pressed {
  transform: scale(0.98);
  background: #f0f7f1;
}

.diagnosis-history-card--disabled {
  opacity: 0.7;
}

@keyframes diagnosis-history-line-draw {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@keyframes diagnosis-history-item-enter {
  from {
    opacity: 0;
    transform: translateX(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes diagnosis-history-node-pop {
  0% {
    opacity: 0;
    transform: scale(0.45);
  }
  70% {
    opacity: 1;
    transform: scale(1.12);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .diagnosis-history-toggle,
  .diagnosis-history-chevron,
  .diagnosis-history-panel,
  .diagnosis-history-card,
  .diagnosis-history-item,
  .diagnosis-history-line,
  .diagnosis-history-node {
    animation: none !important;
    transition: none !important;
  }
}
</style>
