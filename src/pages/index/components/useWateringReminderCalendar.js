import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { createAsyncActionGuard } from '@/utils/interaction-guard.js'
import { saveWateringReminder } from '@/api/plants-http.js'
import {
  removePendingReminderPayload,
  readPendingReminderPayload,
  resolveCurrentPlantId,
  writePendingReminderPayload
} from './watering-reminder-storage.js'
import {
  addPhoneCalendar,
  attachPlanIdToWateringEvents,
  buildReminderNextTime,
  buildWateringReminderCalendarPayload,
  buildWateringReminderSavePayload,
  resolvePlantDisplayName
} from './watering-reminder-options.js'

/**
 * 浇水提醒的日历副作用与失败恢复。
 * 日历写入成功后先保留待同步载荷，避免用户重复添加同一条日历提醒。
 */
export function useWateringReminderCalendar({
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
}) {
  const addToCalendarAction = createAsyncActionGuard()

  function currentPlantId() {
    return resolveCurrentPlantId(props.plant)
  }

  function restorePendingReminderSavePayload(plantId = currentPlantId()) {
    const payload = readPendingReminderPayload({ storageApi: uni, userStore, plantId })
    if (payload) {
      pendingReminderSavePayload.value = payload
      pendingReminderPlantId.value = String(plantId)
      calendarSyncError.value = '手机日历已添加，青花植还没同步成功。请继续同步，不要重复添加日历。'
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

  function resetCalendarState() {
    pendingReminderSavePayload.value = null
    pendingReminderPlantId.value = ''
    calendarSyncError.value = ''
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

  return {
    currentPlantId,
    restorePendingReminderSavePayload,
    clearPendingReminderSavePayload,
    resetCalendarState,
    mirrorSavedReminder,
    addToCalendar
  }
}
