<template>
  <view>
    <BottomSheet
      ref="popupRef"
      panel-id="watering-reminder-sheet"
      content-id="watering-reminder-sheet-content"
      close-id="watering-reminder-close-button"
      confirm-id="watering-reminder-confirm-button"
      title="添加浇水提醒"
      height-mode="fullHeight"
      :confirm-text="addToCalendarText"
      loading-text="正在更新建议…"
      show-confirm
      :mask-click="!loading && !inputFlowLoading"
      :confirm-loading="loading || inputFlowLoading"
      @change="onPopupChange"
    >
      <template v-if="inputFlowOpen">
        <WateringReminderInputStepper
          ref="inputStepperRef"
          :active-step="inputFlowStep"
          :timeline="timelineInput"
          :loading="reminderLoading"
          :error="weatherError"
          :pot-volume-ml="potVolumeMl"
          :initial-profile="props.plant?.potProfile"
          @update:active-step="inputFlowStep = $event"
          @history-change="onTimelineChange"
        />
        <view
          v-if="plannerError"
          id="watering-reminder-input-error"
          class="mt-3 rounded-xl border border-[#f2d99a] bg-[#fff7df] px-3 py-2"
        >
          <text class="block text-[12px] leading-5 text-[#8A5A00]">{{ plannerError }}</text>
        </view>
      </template>
      <template v-else>
        <WateringReminderResultCard
          :is-over-watering-blocked="isOverWateringBlocked"
          :is-overdue="isOverdue"
          :next-water-display="nextWaterDisplay"
          :amount-bottle-text="amountBottleText"
          :pot-profile-state="potProfileState"
          :soil-check-message="plannerResult?.soilCheck?.message || ''"
        />
        <view
          v-if="calendarSyncError"
          id="watering-reminder-calendar-sync-error"
          class="mt-3 rounded-xl border border-[#f2d99a] bg-[#fff7df] px-3 py-2"
        >
          <text class="block text-[12px] leading-5 text-[#8A5A00]">{{ calendarSyncError }}</text>
        </view>
        <view
          v-if="plannerError"
          id="watering-reminder-planner-error"
          class="mt-3 rounded-xl border border-[#f2d99a] bg-[#fff7df] px-3 py-2"
        >
          <text class="block text-[12px] leading-5 text-[#8A5A00]">{{ plannerError }}</text>
        </view>

        <WateringReminderInputSection
          :last-watering-text="lastWateringText"
          :pot-profile-summary="potProfileSummary"
          @last-watering="openLastWateringPicker"
          @pot-profile="openPotProfileEditor"
        />
      </template>

      <SavedWateringReminderState
        v-if="savedReminderActive && !inputFlowOpen"
        :display="savedReminderDisplay"
      />
      <template #confirm>
        <view v-if="inputFlowOpen" class="flex gap-3">
          <button
            id="watering-reminder-input-previous-button"
            class="m-0 flex-1 rounded-[14px] border border-[#2d7a4f] bg-white py-3 text-[15px] font-semibold text-[#2d7a4f] after:border-0"
            hover-class="none"
            :disabled="inputFlowLoading"
            @click="handleInputPrevious"
          >
            上一步
          </button>
          <button
            id="watering-reminder-input-next-button"
            class="m-0 flex-[2] rounded-[14px] bg-[#2d7a4f] py-3 text-[15px] font-semibold text-white after:border-0 disabled:bg-gray-300"
            hover-class="none"
            :disabled="inputFlowLoading || (inputFlowStep === 0 && !inputFlowHasHistory)"
            @click="handleInputNext"
          >
            {{ inputFlowLoading ? '正在更新建议…' : inputFlowNextText }}
          </button>
        </view>
        <button
          v-else
          id="watering-reminder-confirm-button"
          class="m-0 w-full rounded-[14px] bg-[#2d7a4f] py-3 text-[15px] font-semibold text-white after:border-0 disabled:bg-gray-300"
          hover-class="none"
          :disabled="!canAddToCalendar || loading"
          @click="addToCalendar"
        >
          {{ loading ? '正在更新建议…' : addToCalendarText }}
        </button>
      </template>
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import { fetchWateringReminder } from '@/api/plants-http.js'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import SavedWateringReminderState from './SavedWateringReminderState.vue'
import WateringReminderInputStepper from './WateringReminderInputStepper.vue'
import WateringReminderInputSection from './WateringReminderInputSection.vue'
import WateringReminderResultCard from './WateringReminderResultCard.vue'
import { useWateringReminderCalendar } from './useWateringReminderCalendar.js'
import { useWateringReminderInputFlow } from './useWateringReminderInputFlow.js'
import { useWateringReminderPlanner } from './useWateringReminderPlanner.js'
import {
  buildPotProfileSummary,
  buildSavedReminderDisplay,
  buildWateringReminderInputSignature,
  isWateringReminderActive,
  normalizeSavedReminderPlannerResult,
  resolveLastWateringDate,
  resolvePotProfileState,
  todayStr
} from './watering-reminder-options.js'

const props = defineProps({ plant: { type: Object, default: null } })
const emit = defineEmits(['close'])
const plantStore = usePlantStore()
const plantingStore = usePlantingStore()
const userStore = useUserStore()
const popupRef = ref(null)
const isSheetOpen = ref(false)
const pendingReminderReload = ref(false)
const reminderLoading = ref(false)
const savedReminder = ref(null)
const savedReminderInputSignature = ref('')
const selectedWateringEvents = ref([])
const wateringHistoryTouched = ref(false)
const remoteWateringEvents = ref([])
const pendingReminderSavePayload = ref(null)
const pendingReminderPlantId = ref('')
const calendarSyncError = ref('')
const savedReminderWateringEvents = computed(() =>
  Array.isArray(savedReminder.value?.wateringEvents) ? savedReminder.value.wateringEvents : []
)
const initialWateringEvents = computed(() =>
  Array.isArray(props.plant?.wateringEvents) ? props.plant.wateringEvents : []
)
const persistedWateringEvents = computed(() =>
  remoteWateringEvents.value.length ? remoteWateringEvents.value : initialWateringEvents.value
)
const selectedWateringEventsForPlanner = computed(() =>
  wateringHistoryTouched.value
    ? selectedWateringEvents.value
    : savedReminderWateringEvents.value.length
      ? savedReminderWateringEvents.value
      : persistedWateringEvents.value
)
const {
  plannerResult,
  loading,
  weatherLoading,
  weatherError,
  plannerError,
  weatherDays,
  forecastDays,
  environmentWeatherWindow,
  plannerLocationKey,
  plannerTimezone,
  potVolumeMl,
  isOverWateringBlocked,
  amountBottleText,
  resetWeatherPlannerState,
  loadWeatherDays,
  fetchPlanner
} = useWateringReminderPlanner({ props, userStore, selectedWateringEventsForPlanner })
const {
  inputStepperRef,
  inputFlowOpen,
  inputFlowStep,
  inputFlowLoading,
  timelineInput,
  hasRequiredWateringHistory,
  inputFlowHasHistory,
  inputFlowNextText,
  resetInputFlowState,
  openInputFlow,
  openLastWateringPicker,
  openPotProfileEditor,
  onTimelineChange,
  handleInputNext,
  handleInputPrevious
} = useWateringReminderInputFlow({
  props,
  plantStore,
  selectedWateringEvents,
  wateringHistoryTouched,
  selectedWateringEventsForPlanner,
  pendingReminderSavePayload,
  calendarSyncError,
  environmentWeatherWindow,
  weatherLoading,
  plannerError,
  loadWeatherDays,
  fetchPlanner
})
const potProfileSummary = computed(() => {
  return buildPotProfileSummary(props.plant?.potProfile)
})
const potProfileState = computed(() => resolvePotProfileState(props.plant?.potProfile))
const lastWateringText = computed(
  () => resolveLastWateringDate(selectedWateringEventsForPlanner.value) || '尚无记录'
)
const savedReminderActive = computed(() => isWateringReminderActive(savedReminder.value))
const currentReminderInputSignature = computed(() =>
  buildWateringReminderInputSignature({
    lastWatered: lastWateringText.value === '尚无记录' ? '' : lastWateringText.value,
    potProfile: props.plant?.potProfile,
    wateringEvents: selectedWateringEventsForPlanner.value
  })
)
const savedReminderChanged = computed(
  () =>
    savedReminderActive.value &&
    savedReminderInputSignature.value &&
    currentReminderInputSignature.value !== savedReminderInputSignature.value
)
const isLowConfidencePlan = computed(
  () => plannerResult.value?.confidenceLevel === 'low' || potProfileState.value !== 'complete'
)
const canAddToCalendar = computed(
  () =>
    Boolean(pendingReminderSavePayload.value) ||
    ((!savedReminderActive.value || savedReminderChanged.value) &&
      !isOverWateringBlocked.value &&
      hasRequiredWateringHistory.value &&
      Boolean(plannerResult.value?.nextWaterDate))
)
const addToCalendarText = computed(() =>
  pendingReminderSavePayload.value
    ? '继续同步'
    : savedReminderActive.value && !savedReminderChanged.value
      ? '已添加到日历'
      : isOverWateringBlocked.value
        ? '近期过浇，暂不安排浇水'
        : !hasRequiredWateringHistory.value || !plannerResult.value?.nextWaterDate
          ? '先填写过往浇水日期'
          : '添加到手机日历'
)
const savedReminderDisplay = computed(() => buildSavedReminderDisplay(savedReminder.value))
const isOverdue = computed(
  () =>
    Boolean(plannerResult.value?.nextWaterDate) && plannerResult.value.nextWaterDate < todayStr()
)
const nextWaterDisplay = computed(() => {
  if (!plannerResult.value?.nextWaterDate) {
    return plannerResult.value?.wateringContext === 'likely_too_wet'
      ? '暂不安排浇水'
      : '先填写过往浇水日期'
  }
  if (plannerResult.value.nextWaterDate < todayStr()) {
    const expected = new Date(`${plannerResult.value.nextWaterDate}T12:00:00`)
    const today = new Date(`${todayStr()}T12:00:00`)
    const days = Math.max(1, Math.floor((today - expected) / (24 * 60 * 60 * 1000)))
    return `已逾期 ${days} 天`
  }
  return plannerResult.value.nextWaterDate
})

const {
  currentPlantId,
  restorePendingReminderSavePayload,
  clearPendingReminderSavePayload,
  resetCalendarState,
  mirrorSavedReminder,
  addToCalendar
} = useWateringReminderCalendar({
  props,
  userStore,
  plantStore,
  plantingStore,
  savedReminder,
  savedReminderInputSignature,
  plannerResult,
  loading,
  isLowConfidencePlan,
  canAddToCalendar,
  currentReminderInputSignature,
  lastWateringText,
  selectedWateringEventsForPlanner,
  amountBottleText,
  weatherDays,
  forecastDays,
  plannerLocationKey,
  plannerTimezone,
  pendingReminderSavePayload,
  pendingReminderPlantId,
  calendarSyncError
})
function resetReminderState() {
  selectedWateringEvents.value = []
  wateringHistoryTouched.value = false
  remoteWateringEvents.value = []
  resetInputFlowState()
  savedReminder.value = null
  savedReminderInputSignature.value = ''
  resetCalendarState()
  resetWeatherPlannerState()
}
async function open() {
  isSheetOpen.value = true
  callComponentMethod(popupRef, 'open')
  await nextTick()
  await loadSavedReminder()
}
const close = () => callComponentMethod(popupRef, 'close')
function onPopupChange(event) {
  if (event?.show === false) {
    isSheetOpen.value = false
    emit('close')
    return
  }
  if (event?.show === true) {
    isSheetOpen.value = true
  }
}
async function loadSavedReminder() {
  const plantId = props.plant?.id
  const requestedPlantId = currentPlantId()
  if (!requestedPlantId) {
    return
  }
  if (reminderLoading.value) {
    pendingReminderReload.value = true
    return
  }
  reminderLoading.value = true
  try {
    const response = await fetchWateringReminder(plantId)
    if (currentPlantId() !== requestedPlantId) {
      pendingReminderReload.value = true
      return
    }
    const reminder = response?.code === 200 ? response.data : null
    remoteWateringEvents.value = Array.isArray(reminder?.persistedWateringEvents)
      ? reminder.persistedWateringEvents
      : Array.isArray(reminder?.wateringEvents) && !isWateringReminderActive(reminder)
        ? reminder.wateringEvents
        : []
    if (isWateringReminderActive(reminder)) {
      const reminderEvents = Array.isArray(reminder.wateringEvents) ? reminder.wateringEvents : []
      const effectiveEvents = remoteWateringEvents.value.length
        ? remoteWateringEvents.value
        : reminderEvents
      if (!effectiveEvents.length) {
        savedReminder.value = null
        plannerResult.value = null
        openInputFlow(0)
        return
      }
      const persistedEventsChanged =
        remoteWateringEvents.value.length > 0 &&
        buildWateringReminderInputSignature({ wateringEvents: remoteWateringEvents.value }) !==
          buildWateringReminderInputSignature({ wateringEvents: reminderEvents })
      if (persistedEventsChanged) {
        savedReminder.value = null
        plannerResult.value = null
        selectedWateringEvents.value = [...effectiveEvents]
        wateringHistoryTouched.value = false
        await loadWeatherDays()
        await fetchPlanner()
        return
      }
      clearPendingReminderSavePayload(requestedPlantId)
      savedReminder.value = reminder
      plannerResult.value = normalizeSavedReminderPlannerResult(reminder)
      selectedWateringEvents.value = effectiveEvents
      wateringHistoryTouched.value = true
      savedReminderInputSignature.value = currentReminderInputSignature.value
      mirrorSavedReminder(reminder)
      return
    }
    savedReminder.value = null
    if (!restorePendingReminderSavePayload(requestedPlantId)) {
      if (persistedWateringEvents.value.length) {
        wateringHistoryTouched.value = false
        await loadWeatherDays()
        await fetchPlanner()
      } else {
        plannerResult.value = null
        openInputFlow(0)
      }
    }
  } catch (error) {
    console.warn('读取浇水提醒失败:', error)
    if (!restorePendingReminderSavePayload(requestedPlantId)) {
      if (persistedWateringEvents.value.length) {
        wateringHistoryTouched.value = false
        await loadWeatherDays()
        await fetchPlanner()
      } else {
        plannerResult.value = null
        openInputFlow(0)
      }
    }
  } finally {
    reminderLoading.value = false
    if (pendingReminderReload.value && isSheetOpen.value) {
      pendingReminderReload.value = false
      await nextTick()
      await loadSavedReminder()
    } else if (!isSheetOpen.value) {
      pendingReminderReload.value = false
    }
  }
}
watch(
  () => props.plant?.id,
  async newPlantId => {
    if (!newPlantId && pendingReminderSavePayload.value) {
      return
    }
    if (
      pendingReminderSavePayload.value &&
      String(newPlantId || '') === pendingReminderPlantId.value
    ) {
      return
    }
    resetReminderState()
    if (newPlantId && isSheetOpen.value) {
      await nextTick()
      await loadSavedReminder()
    }
  }
)
defineExpose({ open, close })
</script>
