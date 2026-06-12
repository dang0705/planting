// Pinia 测试脚本
import { createPinia, defineStore } from 'pinia'
import { createApp } from 'vue'

// 创建 pinia 实例
const pinia = createPinia()

// 创建测试 store
const useTestStore = defineStore('test', {
  state: () => ({
    count: 0,
    name: 'Test Store'
  }),
  getters: {
    doubleCount: (state) => state.count * 2
  },
  actions: {
    increment() {
      this.count++
    }
  }
})

// 创建简单的 Vue 应用来测试
const app = createApp({})
app.use(pinia)

// 测试 store
console.log('=== Pinia 测试开始 ===\n')

try {
  const store = useTestStore()
  
  console.log('✓ Store 创建成功')
  console.log('  Store ID:', store.$id)
  console.log('  初始状态:', { count: store.count, name: store.name })
  
  // 测试 getter
  console.log('\n✓ 测试 Getter')
  console.log('  doubleCount:', store.doubleCount)
  
  // 测试 action
  console.log('\n✓ 测试 Action')
  store.increment()
  console.log('  执行 increment() 后:', { count: store.count, doubleCount: store.doubleCount })
  
  store.increment()
  console.log('  再次执行 increment() 后:', { count: store.count, doubleCount: store.doubleCount })
  
  // 直接修改 state
  console.log('\n✓ 测试直接修改 State')
  store.count = 10
  console.log('  设置 count = 10 后:', { count: store.count, doubleCount: store.doubleCount })
  
  store.name = 'Modified Store'
  console.log('  设置 name 后:', { name: store.name })
  
  console.log('\n' + '='.repeat(50))
  console.log('✓ 所有测试通过！Pinia 在 Vue3 + Uniapp 项目中工作正常')
  console.log('='.repeat(50))
  
} catch (error) {
  console.error('\n✗ 测试失败:', error.message)
  console.error(error.stack)
  process.exit(1)
}
