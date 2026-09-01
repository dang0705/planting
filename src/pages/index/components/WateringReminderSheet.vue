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
      :mask-click="!loading"
      :confirm-loading="loading"
      :confirm-disabled="!canAddToCalendar"
      :on-confirm="addToCalendar"
      @change="onPopupChange"
    >
      <WateringReminderResultCard
        :is-over-watering-blocked="isOverWateringBlocked"
        :is-overdue="isOverdue"
        :next-water-display="nextWaterDisplay"
        :next-water-reason="plannerResult?.nextWaterReason || ''"
        :amount-bottle-text="amountBottleText"
        :pot-profile-state="potProfileState"
        :planner-evidence-text="plannerEvidenceText"
        :soil-check-message="plannerResult?.soilCheck?.message || ''"
        :planner-summary-rows="plannerSummaryRows"
        :reason-codes="plannerResult?.reasonCodes || []"
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

      <SavedWateringReminderState v-if="savedReminderActive" :display="savedReminderDisplay" />
    </BottomSheet>

    <WateringDatePickerSheet
      ref="datePickerRef"
      :timeline="timelineInput"
      :loading="reminderLoading || weatherLoading"
      :error="weatherError"
      :pot-volume-ml="potVolumeMl"
      @timeline-change="onTimelineChange"
      @confirm="confirmDatePicker"
    />

    <PotProfileEditor ref="potProfileEditorRef" :plant="props.plant" @saved="onPotProfileSaved" />
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import { fetchWateringReminder, saveWateringReminder } from '@/api/plants-http.js'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { createAsyncActionGuard } from '@/utils/interaction-guard.js'
import PotProfileEditor from './PotProfileEditor.vue'
import SavedWateringReminderState from './SavedWateringReminderState.vue'
import WateringReminderInputSection from './WateringReminderInputSection.vue'
import WateringReminderResultCard from './WateringReminderResultCard.vue'
import WateringDatePickerSheet from './WateringDatePickerSheet.vue'
import {
  removePendingReminderPayload,
  readPendingReminderPayload,
  resolveCurrentPlantId,
  writePendingReminderPayload
} from './watering-reminder-storage.js'
import { useWateringReminderPlanner } from './useWateringReminderPlanner.js'
import {
  addPhoneCalendar,
  attachPlanIdToWateringEvents,
  buildPotProfileSummary,
  buildReminderNextTime,
  buildSavedReminderDisplay,
  buildWateringReminderInputSignature,
  buildWateringReminderCalendarPayload,
  buildWateringReminderSavePayload,
  buildPlannerEvidenceText,
  isWateringReminderActive,
  normalizeSavedReminderPlannerResult,
  resolveLastWateringDate,
  resolvePotProfileState,
  resolvePlantDisplayName,
  todayStr
} from './watering-reminder-options.js'

const props = defineProps({ plant: { type: Object, default: null } })
const emit = defineEmits(['close'])
const plantStore = usePlantStore()
const plantingStore = usePlantingStore()
const userStore = useUserStore()
const popupRef = ref(null)
const datePickerRef = ref(null)
const potProfileEditorRef = ref(null)
const isSheetOpen = ref(false)
const pendingReminderReload = ref(false)
const reminderLoading = ref(false)
const savedReminder = ref(null)
const savedReminderInputSignature = ref('')
const selectedWateringEvents = ref([])
const pendingReminderSavePayload = ref(null)
const pendingReminderPlantId = ref('')
const calendarSyncError = ref('')
const addToCalendarAction = createAsyncActionGuard()
const savedReminderWateringEvents = computed(() =>
  Array.isArray(savedReminder.value?.wateringEvents) ? savedReminder.value.wateringEvents : []
)
const initialWateringEvents = computed(() =>
  Array.isArray(props.plant?.wateringEvents) ? props.plant.wateringEvents : []
)
const selectedWateringEventsForPlanner = computed(() =>
  selectedWateringEvents.value.length
    ? selectedWateringEvents.value
    : savedReminderWateringEvents.value.length
      ? savedReminderWateringEvents.value
      : initialWateringEvents.value
)
const {
  plannerResult,
  loading,
  hasWeatherRef,
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
  plannerSummaryRows,
  resetWeatherPlannerState,
  loadWeatherDays,
  fetchPlanner
} = useWateringReminderPlanner({ props, userStore, selectedWateringEventsForPlanner })
const potProfileSummary = computed(() => {
  return buildPotProfileSummary(props.plant?.potProfile)
})
const potProfileState = computed(() => resolvePotProfileState(props.plant?.potProfile))
const plannerEvidenceText = computed(() =>
  plannerResult.value
    ? buildPlannerEvidenceText({
        plannerResult: plannerResult.value,
        potProfile: props.plant?.potProfile,
        wateringEvents: selectedWateringEventsForPlanner.value,
        hasWeatherRef: hasWeatherRef.value
      })
    : ''
)
const timelineInput = computed(() => {
  const base = { reference_date: todayStr(), watering_events_10d: initialWateringEvents.value }
  return environmentWeatherWindow.value
    ? mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(base, environmentWeatherWindow.value)
    : base
})
const lastWateringText = computed(
  () => resolveLastWateringDate(selectedWateringEventsForPlanner.value) || '尚无记录'
)
const savedReminderActive = computed(() => isWateringReminderActive(savedReminder.value))
const currentReminderInputSignature = computed(() =>
  buildWateringReminderInputSignature({
    lastWatered: lastWateringText.value === '尚无记录' ? '' : lastWateringText.value,
    potProfile: props.plant?.potProfile
  })
)
const savedReminderChanged = computed(
  () =>
    savedReminderActive.value &&
    savedReminderInputSignature.value &&
    currentReminderInputSignature.value !== savedReminderInputSignature.value
)
const isLowConfidencePlan = computed(
  () =>
    plannerResult.value?.confidenceLevel === 'low' ||
    potProfileState.value !== 'complete'
)
const canAddToCalendar = computed(
  () =>
    Boolean(pendingReminderSavePayload.value) ||
    ((!savedReminderActive.value || savedReminderChanged.value) &&
      !isOverWateringBlocked.value &&
      Boolean(plannerResult.value?.nextWaterDate))
)
const addToCalendarText = computed(() =>
  pendingReminderSavePayload.value
    ? '继续同步'
    : savedReminderActive.value && !savedReminderChanged.value
      ? '已保存到手机日历'
      : isOverWateringBlocked.value
        ? '近期过浇，暂不安排浇水'
        : !plannerResult.value?.nextWaterDate
          ? '先记录上次浇水'
          : '添加到手机日历'
)
const savedReminderDisplay = computed(() => buildSavedReminderDisplay(savedReminder.value))
const isOverdue = computed(
  () => Boolean(plannerResult.value?.nextWaterDate) && plannerResult.value.nextWaterDate < todayStr()
)
const nextWaterDisplay = computed(() => {
  if (!plannerResult.value?.nextWaterDate) {
    return plannerResult.value?.wateringContext === 'likely_too_wet'
      ? '暂不安排浇水'
      : '先记录上次浇水'
  }
  if (plannerResult.value.nextWaterDate < todayStr()) {
    const expected = new Date(`${plannerResult.value.nextWaterDate}T12:00:00`)
    const today = new Date(`${todayStr()}T12:00:00`)
    const days = Math.max(1, Math.floor((today - expected) / (24 * 60 * 60 * 1000)))
    return `已逾期 ${days} 天`
  }
  return plannerResult.value.nextWaterDate
})

function currentPlantId() {
  return resolveCurrentPlantId(props.plant)
}

function restorePendingReminderSavePayload(plantId = currentPlantId()) {
  const payload = readPendingReminderPayload({ storageApi: uni, userStore, plantId })
  if (payload) {
    pendingReminderSavePayload.value = payload
    pendingReminderPlantId.value = String(plantId)
    calendarSyncError.value =
      '手机日历已添加，青花植还没同步成功。请继续同步，不要重复添加日历。'
    return true
  }
  return false
}
function persistPendingReminderSavePayload(payload) {
  writePendingReminderPayload({ storageApi: uni, userStore, payload })
}
function clearPendingReminderSavePayload(plantId = pendingReminderPlantId.value) {
  removePendingReminderPayload({ storageApi: uni, userStore, plantId })
  pendingReminderSavePayload.value = null
  pendingReminderPlantId.value = ''
  calendarSyncError.value = ''
}
function resetReminderState() {
  selectedWateringEvents.value = []
  savedReminder.value = null
  savedReminderInputSignature.value = ''
  pendingReminderSavePayload.value = null
  pendingReminderPlantId.value = ''
  calendarSyncError.value = ''
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
  if (!event.show) {
    isSheetOpen.value = false
    emit('close')
    return
  }
  isSheetOpen.value = true
}
async function openLastWateringPicker() {
  if (pendingReminderSavePayload.value) {
    calendarSyncError.value = '请先继续同步这条提醒，不要重复添加日历。'
    return
  }
  callComponentMethod(datePickerRef, 'open')
  if (!environmentWeatherWindow.value && !weatherLoading.value) {
    await loadWeatherDays()
  }
}
function onTimelineChange(payload) {
  selectedWateringEvents.value = payload?.watering_events_10d || []
}
async function confirmDatePicker() {
  callComponentMethod(datePickerRef, 'close')
  await nextTick()
  await fetchPlanner()
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
    if (isWateringReminderActive(reminder)) {
      clearPendingReminderSavePayload(requestedPlantId)
      savedReminder.value = reminder
      plannerResult.value = normalizeSavedReminderPlannerResult(reminder)
      selectedWateringEvents.value = Array.isArray(reminder.wateringEvents)
        ? reminder.wateringEvents
        : []
      savedReminderInputSignature.value = currentReminderInputSignature.value
      mirrorSavedReminder(reminder)
      return
    }
    savedReminder.value = null
    if (!restorePendingReminderSavePayload(requestedPlantId)) {
      await loadWeatherDays()
      await fetchPlanner()
    }
  } catch (error) {
    console.warn('读取浇水提醒失败:', error)
    if (!restorePendingReminderSavePayload(requestedPlantId)) {
      await loadWeatherDays()
      await fetchPlanner()
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
function openPotProfileEditor() {
  if (pendingReminderSavePayload.value) {
    calendarSyncError.value = '请先继续同步这条提醒，不要重复添加日历。'
    return
  }
  callComponentMethod(potProfileEditorRef, 'open')
}
function onPotProfileSaved() {
  if (!pendingReminderSavePayload.value) {
    fetchPlanner()
  }
}
function mirrorSavedReminder(reminder) {
  plantStore.applyWateringReminder(props.plant.id, reminder)
  plantingStore.setPlantReminder({
    plantId: props.plant.id,
    plantName: resolvePlantDisplayName(props.plant),
    type: 'water',
    nextTime: reminder.nextTime || buildReminderNextTime(reminder.nextWaterDate),
    intervalDays: plannerResult.value?.nextWaterWindow?.[0] || 0,
    repeat: false
  })
}
function addToCalendar() {
  return addToCalendarAction.run(async () => {
    if (!canAddToCalendar.value || !props.plant?.id) {
      return
    }
    if (!pendingReminderSavePayload.value && isLowConfidencePlan.value) {
      const confirmed = await new Promise(resolve => {
        uni.showModal({
          title: '提醒日期暂估',
          content: '当前盆型信息不完整，这个日期是暂估。仍要添加提醒吗？',
          cancelText: '先补充盆型',
          confirmText: '仍然添加',
          success: result => resolve(Boolean(result.confirm)),
          fail: () => resolve(false)
        })
      })
      if (!confirmed) {
        return
      }
    }
    loading.value = true
    try {
      if (!pendingReminderSavePayload.value) {
        const nextWaterDate = plannerResult.value?.nextWaterDate
        if (!nextWaterDate) {
          throw new Error('请先生成浇水建议')
        }
        const calendarPayload = buildWateringReminderCalendarPayload({
          plant: props.plant,
          nextWaterDate,
          amountText: amountBottleText.value,
          reasonText: plannerResult.value?.nextWaterReason || ''
        })
        await addPhoneCalendar(calendarPayload)
        const planId = plannerResult.value?.planId || `calendar_${Date.now()}`
        pendingReminderSavePayload.value = buildWateringReminderSavePayload({
          plantId: props.plant.id,
          planId,
          lastWatered: lastWateringText.value === '尚无记录' ? '' : lastWateringText.value,
          nextWaterDate,
          wateringEvents: attachPlanIdToWateringEvents(
            selectedWateringEventsForPlanner.value,
            planId
          ),
          plannerResult: plannerResult.value,
          calendarPayload,
          weatherDays: weatherDays.value,
          forecastDays: forecastDays.value,
          locationKey: plannerLocationKey.value,
          timezone: plannerTimezone.value,
          airEnvironmentOverride: props.plant?.airEnvironment?.input || null
        })
        pendingReminderPlantId.value = currentPlantId()
        persistPendingReminderSavePayload(pendingReminderSavePayload.value)
      }
      const response = await saveWateringReminder(pendingReminderSavePayload.value)
      if (response?.code === 404) {
        clearPendingReminderSavePayload()
        throw new Error('植物已删除，请在手机日历中删除这条提醒')
      }
      if (response?.code !== 200 || !response.data) {
        throw new Error(response?.message || '应用内提醒保存失败')
      }
      reportAnalyticsEvent(ANALYTICS_EVENTS.WATERING_REMINDER_SAVED)
      savedReminder.value = response.data
      savedReminderInputSignature.value = currentReminderInputSignature.value
      clearPendingReminderSavePayload()
      mirrorSavedReminder(response.data)
      uni.showToast({ title: '提醒已添加', icon: 'success' })
    } catch (error) {
      if (pendingReminderSavePayload.value) {
        calendarSyncError.value =
          '手机日历已添加，青花植还没同步成功。请继续同步，不要重复添加日历。'
      } else {
        calendarSyncError.value = error?.message || '暂时无法添加提醒，请稍后重试。'
      }
    } finally {
      loading.value = false
    }
  })
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
