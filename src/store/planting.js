import { defineStore } from 'pinia'

export const usePlantingStore = defineStore('planting', {
  state: () => ({
    plans: [],
    weather: {
      current: null,
      forecast: []
    },
    solarTerms: [] // 二十四节气
  }),

  getters: {
    activePlans: state => state.plans.filter(plan => !plan.archived),
    todayReminders: state => {
      const today = new Date().toDateString()
      return state.plans.filter(plan => {
        return plan.reminders.some(reminder => {
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
