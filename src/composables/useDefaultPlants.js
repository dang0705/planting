import { computed } from 'vue'
import { usePlantStore } from '@/store/plant.js'

export function useDefaultPlants() {
  const plantStore = usePlantStore()

  // 直接使用 store 中的数据
  const plants = computed(() => plantStore.defaultPlants.filter(p => p.show))
  const loading = computed(() => false) // store 中没有 loading 状态，如需要可在 store 中添加

  /**
   * 加载或搜索植物
   * @param {string} keyword - 搜索关键词
   */
  async function load(keyword = '') {
    return await plantStore.searchDefaultPlants(keyword)
  }

  return { plants, loading, load }
}
