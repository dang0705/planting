import { ref, computed } from 'vue'
import { usePlantStore } from '@/store/plant.js'

export function useDefaultPlants() {
  const plantStore = usePlantStore()
  const searchResults = ref([])
  const isSearching = ref(false)

  // 如果正在搜索，显示搜索结果；否则显示 show=1 的植物
  const plants = computed(() => {
    if (isSearching.value) {
      return searchResults.value
    }
    return plantStore.defaultPlants.filter(p => p.show)
  })

  const loading = computed(() => false)

  /**
   * 加载或搜索植物
   * @param {string} keyword - 搜索关键词
   */
  async function load(keyword = '') {
    const results = await plantStore.searchDefaultPlants(keyword)

    if (keyword && keyword.trim()) {
      // 有搜索关键词，显示搜索结果
      isSearching.value = true
      searchResults.value = results
    } else {
      // 无搜索关键词，显示默认列表
      isSearching.value = false
      searchResults.value = []
    }
  }

  return { plants, loading, load }
}
