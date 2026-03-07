import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Pinia Test'
  }),
  
  getters: {
    doubleCount: (state) => state.count * 2,
    displayText: (state) => `${state.name}: ${state.count}`
  },
  
  actions: {
    increment() {
      this.count++
    },
    decrement() {
      this.count--
    },
    reset() {
      this.count = 0
    },
    setName(newName) {
      this.name = newName
    }
  }
})
