export const PENDING_REMINDER_SYNC_STORAGE_PREFIX = 'watering-reminder-pending-sync-v1'

export function resolveCurrentPlantId(plant) {
  return plant?.id === undefined || plant?.id === null ? '' : String(plant.id)
}

export function buildPendingReminderStorageKey(userStore, plantId) {
  const openid = String(userStore.openid || '').trim()
  const normalizedPlantId = String(plantId || '').trim()
  if (!openid || !normalizedPlantId) {
    return ''
  }
  return `${PENDING_REMINDER_SYNC_STORAGE_PREFIX}:${encodeURIComponent(openid)}:${normalizedPlantId}`
}

export function readPendingReminderPayload({ storageApi, userStore, plantId }) {
  const storageKey = buildPendingReminderStorageKey(userStore, plantId)
  if (!storageKey) {
    return null
  }
  try {
    const stored = storageApi?.getStorageSync?.(storageKey)
    const payload = stored?.payload
    return payload && String(payload.plantId || '') === String(plantId || '') ? payload : null
  } catch (error) {
    console.warn('读取待同步浇水提醒失败:', error)
    return null
  }
}

export function writePendingReminderPayload({ storageApi, userStore, payload }) {
  const plantId = String(payload?.plantId || '')
  const storageKey = buildPendingReminderStorageKey(userStore, plantId)
  if (!storageKey || !plantId) {
    return
  }
  try {
    storageApi?.setStorageSync?.(storageKey, { payload })
  } catch (error) {
    console.warn('保存待同步浇水提醒失败:', error)
  }
}

export function removePendingReminderPayload({ storageApi, userStore, plantId }) {
  const storageKey = buildPendingReminderStorageKey(userStore, plantId)
  if (!storageKey) {
    return
  }
  try {
    storageApi?.removeStorageSync?.(storageKey)
  } catch (error) {
    console.warn('清除待同步浇水提醒失败:', error)
  }
}
