import { defineStore } from 'pinia'

export const useDiagnoseStore = defineStore('diagnose', {
  state: () => ({
    currentDiagnosis: null,
    history: [],
    loading: false
  }),

  getters: {
    hasHistory: (state) => state.history.length > 0,
    recentDiagnoses: (state) => state.history.slice(0, 5)
  },

  actions: {
    setLoading(loading) {
      this.loading = loading
    },

    setCurrentDiagnosis(diagnosis) {
      this.currentDiagnosis = diagnosis
    },

    addToHistory(diagnosis) {
      this.history.unshift({
        ...diagnosis,
        id: Date.now(),
        createTime: new Date().toISOString()
      })

      // 只保留最近 50 条记录
      if (this.history.length > 50) {
        this.history = this.history.slice(0, 50)
      }
    },

    clearHistory() {
      this.history = []
    },

    removeFromHistory(id) {
      this.history = this.history.filter(item => item.id !== id)
    }
  }
})
