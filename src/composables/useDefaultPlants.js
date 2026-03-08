import { ref } from 'vue'
import { resolveImageUrls } from './useCloudFile'

const CACHE_KEY = 'default_plants_data'
const CACHE_TTL = 24 * 60 * 60 * 1000

export function useDefaultPlants() {
  const plants = ref([])
  const loading = ref(false)

  async function load(searchName = '') {
    // 如果有搜索关键词，不使用缓存，直接请求
    if (searchName && searchName.trim()) {
      loading.value = true
      try {
        const res = await wx.cloud.callFunction({
          name: 'getDefaultPlants',
          data: { name: searchName.trim() }
        })
        if (res.result?.code === 200) {
          const list = res.result.data
          plants.value = await resolveImageUrls(list)
        }
      } catch (e) {
        console.error('搜索植物失败:', e)
      } finally {
        loading.value = false
      }
      return
    }

    // 无搜索关键词，使用缓存逻辑
    let cached = null
    try {
      cached = uni.getStorageSync(CACHE_KEY)
    } catch (_) {}

    if (cached?.ts && Date.now() - cached.ts < CACHE_TTL && cached.data?.length) {
      loading.value = true
      plants.value = await resolveImageUrls(cached.data)
      loading.value = false
      return
    }

    // 无缓存或已过期，从云函数获取
    loading.value = true
    try {
      const res = await wx.cloud.callFunction({ name: 'getDefaultPlants' })
      if (res.result?.code === 200) {
        const list = res.result.data
        try { uni.setStorageSync(CACHE_KEY, { ts: Date.now(), data: list }) } catch (_) {}
        plants.value = await resolveImageUrls(list)
      }
    } catch (e) {
      console.error('加载默认植物失败:', e)
    } finally {
      loading.value = false
    }
  }

  return { plants, loading, load }
}
