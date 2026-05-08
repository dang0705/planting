import { computed, ref } from 'vue'
import { fetchPlantCatalogQuery } from '@/vue-query/plants/queries/catalog.js'
import { getFileUrl } from '@/composables/useCloudFile.js'

export function useDefaultPlants() {
  const keywordRef = ref('')
  const page = ref(1)
  const pageSize = ref(10)
  const plants = ref([])
  const total = ref(0)
  const hasMore = ref(false)
  const initialLoading = ref(false)
  const loadingMore = ref(false)
  const loading = computed(() => initialLoading.value || loadingMore.value)

  async function fetchCatalogPage(targetPage) {
    const normalizedKeyword = keywordRef.value.trim()
    console.log('[PlantCatalogQuery] fetch', {
      keyword: normalizedKeyword,
      pageParam: targetPage,
      pageSize: pageSize.value
    })
    const response = await fetchPlantCatalogQuery(normalizedKeyword, targetPage, pageSize.value)
    const data = response?.data || {}
    const list = Array.isArray(data?.list) ? data.list : Array.isArray(data) ? data : []

    for (const plant of list) {
      if (plant.imageFileId) {
        plant.image = await getFileUrl(plant.imageFileId)
        plant.imageUrl = plant.image
      }
    }

    const payload = {
      list,
      total: Number(data?.total || list.length || 0),
      page: Number(data?.page || targetPage),
      pageSize: Number(data?.pageSize || pageSize.value),
      hasMore: Boolean(data?.hasMore)
    }

    total.value = payload.total
    hasMore.value = payload.hasMore
    page.value = payload.page
    return payload.list
  }

  /**
   * 加载或搜索植物
   * @param {string} keyword - 搜索关键词
   */
  async function load(nextKeyword = '', nextPage = 1) {
    if (nextPage !== 1) {
      await loadNextPage()
      return
    }

    keywordRef.value = String(nextKeyword || '').trim()
    console.log('[PlantCatalogQuery] load', {
      keyword: keywordRef.value,
      page: 1,
      pageSize: pageSize.value
    })
    initialLoading.value = true
    try {
      plants.value = await fetchCatalogPage(1)
    } finally {
      initialLoading.value = false
    }
  }

  async function loadNextPage() {
    if (!hasMore.value || loadingMore.value) {return}
    loadingMore.value = true
    try {
      const nextList = await fetchCatalogPage(page.value + 1)
      plants.value = [...plants.value, ...nextList]
    } finally {
      loadingMore.value = false
    }
  }

  function reset() {
    keywordRef.value = ''
    page.value = 1
    plants.value = []
    total.value = 0
    hasMore.value = false
  }

  return {
    plants,
    loading,
    initialLoading,
    loadingMore,
    load,
    loadNextPage,
    page,
    pageSize,
    total,
    hasMore,
    reset
  }
}
