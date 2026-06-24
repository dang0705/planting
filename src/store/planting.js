import { defineStore } from 'pinia'

const REMINDER_TYPES = new Set(['water', 'fertilize'])

function normalizePlantId(value) {
  return value === undefined || value === null ? '' : String(value)
}

function isRepeatReminder(reminder = {}) {
  return Boolean(
    reminder.repeat ||
    reminder.cycle ||
    Number(reminder.intervalDays) > 0 ||
    Number(reminder.repeatDays) > 0
  )
}

export function isActivePlantReminder(plan = {}, reminder = {}, type = '', now = new Date()) {
  if (!plan || plan.archived || reminder?.type !== type || reminder?.enabled === false) {
    return false
  }
  if (isRepeatReminder(reminder)) {
    return true
  }
  if (!reminder?.nextTime) {
    return false
  }
  const nextTime = new Date(reminder.nextTime)
  if (Number.isNaN(nextTime.getTime())) {
    return false
  }
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  return nextTime >= todayStart
}

function findPlantReminderState(plans = [], plantId = '', type = '', now = new Date()) {
  const targetPlantId = normalizePlantId(plantId)
  if (!targetPlantId || !REMINDER_TYPES.has(type)) {
    return { active: false, plan: null, reminder: null, nextTime: '' }
  }
  for (const plan of plans) {
    if (plan.archived || normalizePlantId(plan.plantId) !== targetPlantId) {
      continue
    }
    const reminders = Array.isArray(plan.reminders) ? plan.reminders : []
    for (const reminder of reminders) {
      if (reminder?.type !== type) {
        continue
      }
      const active = isActivePlantReminder(plan, reminder, type, now)
      if (active) {
        return {
          active: true,
          plan,
          reminder,
          nextTime: reminder.nextTime || ''
        }
      }
    }
  }
  return { active: false, plan: null, reminder: null, nextTime: '' }
}

export const usePlantingStore = defineStore('planting', {
  state: () => ({
    plans: [],
    reminderFocus: null,
    weather: {
      current: null,
      forecast: []
    },
    solarTerms: [] // 二十四节气
  }),

  getters: {
    activePlans: state => state.plans.filter(plan => !plan.archived),
    getPlantReminderState: state => (plantId, type) =>
      findPlantReminderState(state.plans, plantId, type),
    todayReminders: state => {
      const today = new Date().toDateString()
      return state.plans.filter(plan => {
        if (plan.archived || !Array.isArray(plan.reminders)) {
          return false
        }
        return plan.reminders.some(reminder => {
          if (reminder.enabled === false || !reminder.nextTime) {
            return false
          }
          const reminderDate = new Date(reminder.nextTime).toDateString()
          return reminderDate === today
        })
      })
    }
  },

  actions: {
    addPlan(plan) {
      this.plans.push({
        ...plan,
        id: Date.now(),
        createTime: new Date().toISOString(),
        archived: false
      })
    },

    setReminderFocus(focus) {
      const plantId = normalizePlantId(focus?.plantId)
      const type = focus?.type
      if (!plantId || !REMINDER_TYPES.has(type)) {
        this.reminderFocus = null
        return
      }
      this.reminderFocus = {
        plantId,
        plantName: focus?.plantName || '当前植物',
        type
      }
    },

    consumeReminderFocus() {
      const focus = this.reminderFocus
      this.reminderFocus = null
      return focus
    },

    setPlantReminder(payload = {}) {
      const plantId = normalizePlantId(payload.plantId)
      const type = payload.type
      if (!plantId || !REMINDER_TYPES.has(type)) {
        return { success: false, message: '无效的提醒类型' }
      }
      const nextTime = payload.nextTime || buildDefaultReminderTime()
      const intervalDays = Number(payload.intervalDays || 7)
      let plan = this.plans.find(
        item => !item.archived && normalizePlantId(item.plantId) === plantId
      )
      if (!plan) {
        plan = {
          id: Date.now(),
          plantId,
          plantName: payload.plantName || '当前植物',
          location: payload.location || '',
          plantDate: payload.plantDate || new Date().toISOString(),
          reminders: [],
          createTime: new Date().toISOString(),
          archived: false
        }
        this.plans.push(plan)
      }
      if (!Array.isArray(plan.reminders)) {
        plan.reminders = []
      }
      const reminder = plan.reminders.find(item => item?.type === type)
      const updates = {
        type,
        enabled: true,
        nextTime,
        intervalDays,
        repeat: true,
        updatedAt: new Date().toISOString()
      }
      if (reminder) {
        Object.assign(reminder, updates)
      } else {
        plan.reminders.push({
          ...updates,
          id: `${plantId}-${type}-${Date.now()}`
        })
      }
      return { success: true }
    },

    disablePlantReminder(payload = {}) {
      const plantId = normalizePlantId(payload.plantId)
      const type = payload.type
      if (!plantId || !REMINDER_TYPES.has(type)) {
        return { success: false, message: '无效的提醒类型' }
      }
      let changed = false
      this.plans.forEach(plan => {
        if (plan.archived || normalizePlantId(plan.plantId) !== plantId) {
          return
        }
        if (!Array.isArray(plan.reminders)) {
          return
        }
        plan.reminders = plan.reminders.map(reminder => {
          if (reminder?.type !== type) {
            return reminder
          }
          changed = true
          return {
            ...reminder,
            enabled: false,
            updatedAt: new Date().toISOString()
          }
        })
      })
      return { success: true, changed }
    },

    updatePlan(id, updates) {
      const index = this.plans.findIndex(p => p.id === id)
      if (index !== -1) {
        this.plans[index] = { ...this.plans[index], ...updates }
      }
    },

    deletePlan(id) {
      this.plans = this.plans.filter(p => p.id !== id)
    },

    archivePlan(id) {
      const plan = this.plans.find(p => p.id === id)
      if (plan) {
        plan.archived = true
      }
    },

    setWeather(weather) {
      this.weather = weather
    },

    setSolarTerms(terms) {
      this.solarTerms = terms
    }
  }
})

function buildDefaultReminderTime() {
  const nextTime = new Date()
  nextTime.setDate(nextTime.getDate() + 1)
  nextTime.setHours(9, 0, 0, 0)
  return nextTime.toISOString()
}
