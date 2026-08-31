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
  const error = ref('')
  const loading = computed(() => initialLoading.value || loadingMore.value)
  let requestSequence = 0

  async function fetchCatalogPage(targetPage, keyword = keywordRef.value) {
    const normalizedKeyword = String(keyword || '').trim()
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

    return payload
  }

  function applyCatalogPayload(payload, { replace = false } = {}) {
    total.value = payload.total
    hasMore.value = payload.hasMore
    page.value = payload.page
    plants.value = replace ? payload.list : [...plants.value, ...payload.list]
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

    const sequence = ++requestSequence
    keywordRef.value = String(nextKeyword || '').trim()
    console.log('[PlantCatalogQuery] load', {
      keyword: keywordRef.value,
      page: 1,
      pageSize: pageSize.value
    })
    initialLoading.value = true
    loadingMore.value = false
    error.value = ''
    try {
      const payload = await fetchCatalogPage(1, keywordRef.value)
      if (sequence !== requestSequence) {
        return
      }
      applyCatalogPayload(payload, { replace: true })
    } catch {
      if (sequence === requestSequence) {
        error.value = '暂时无法加载植物列表，请稍后重试'
      }
    } finally {
      if (sequence === requestSequence) {
        initialLoading.value = false
      }
    }
  }

  async function loadNextPage() {
    if (!hasMore.value || loadingMore.value) {
      return
    }
    const sequence = requestSequence
    const targetPage = page.value + 1
    const keyword = keywordRef.value
    loadingMore.value = true
    error.value = ''
    try {
      const payload = await fetchCatalogPage(targetPage, keyword)
      if (sequence !== requestSequence) {
        return
      }
      applyCatalogPayload(payload)
    } catch {
      if (sequence === requestSequence) {
        error.value = '暂时无法加载更多植物，请稍后重试'
      }
    } finally {
      if (sequence === requestSequence) {
        loadingMore.value = false
      }
    }
  }

  function reset() {
    requestSequence += 1
    keywordRef.value = ''
    page.value = 1
    plants.value = []
    total.value = 0
    hasMore.value = false
    error.value = ''
    initialLoading.value = false
    loadingMore.value = false
  }

  return {
    plants,
    loading,
    initialLoading,
    loadingMore,
    error,
    load,
    loadNextPage,
    page,
    pageSize,
    total,
    hasMore,
    reset
  }
}
