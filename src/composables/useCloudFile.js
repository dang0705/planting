import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import {
  fetchCloudFileUrlQuery,
  invalidateCloudFileUrlQuery
} from '@/vue-query/storage/queries/file-urls.js'

const TEMP_URL_REFRESH_SAFETY_MS = 5 * 60 * 1000

/**
 * 批量将 fileId 转换为临时 URL
 * @param {string[]} fileIds - 云存储文件 ID 数组
 * @returns {Promise<Record<string, string>>} fileId -> tempUrl 映射
 */
export async function getFileUrls(fileIds) {
  const ids = [
    ...new Set((fileIds || []).map(fileId => String(fileId || '').trim()).filter(Boolean))
  ]
  if (!ids.length) {
    return {}
  }
  try {
    const entries = await Promise.all(
      ids.map(async fileId => {
        const result = await fetchCloudFileUrlQuery(fileId)
        return [fileId, result.url]
      })
    )
    const map = Object.fromEntries(entries.filter(([, url]) => url))
    return map
  } catch (e) {
    console.error('获取文件URL失败:', e)
    return {}
  }
}

/**
 * 单个 fileId 转临时 URL
 * @param {string} fileId
 * @returns {Promise<string>}
 */
export async function getFileUrl(fileId) {
  const normalizedFileId = String(fileId || '').trim()
  if (!normalizedFileId) {
    return ''
  }
  const map = await getFileUrls([normalizedFileId])
  return map[normalizedFileId] || ''
}

/**
 * 为对象数组批量填充 imageUrl
 * @param {Array} list - 包含 fileId 字段的对象数组
 * @param {string} fileIdKey - fileId 字段名，默认 'fileId'
 * @param {string} urlKey - 输出的 URL 字段名，默认 'imageUrl'
 * @returns {Promise<Array>}
 */
export async function resolveImageUrls(list, fileIdKey = 'fileId', urlKey = 'imageUrl') {
  const fileIds = list.map(item => item[fileIdKey]).filter(Boolean)
  const urlMap = await getFileUrls(fileIds)
  return list.map(item => ({
    ...item,
    [urlKey]: urlMap[item[fileIdKey]] || ''
  }))
}

/**
 * 响应式单文件 URL hook
 * @param {string} initialFileId
 */
export function useFileUrl(initialFileId = '') {
  const fileId = ref(initialFileId)
  const url = ref('')
  const loading = ref(false)
  const refreshTimer = { value: null }

  function clearRefreshTimer() {
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
  }

  function scheduleRefresh(result) {
    clearRefreshTimer()
    if (!result?.expiresAt || !fileId.value) {
      return
    }
    const delay = Math.max(1000, result.expiresAt - Date.now() - TEMP_URL_REFRESH_SAFETY_MS)
    refreshTimer.value = setTimeout(() => {
      resolve(fileId.value, { force: true })
    }, delay)
  }

  async function resolve(id = fileId.value, { force = false } = {}) {
    const nextFileId = String(id || '').trim()
    fileId.value = nextFileId
    if (!fileId.value) {
      url.value = ''
      clearRefreshTimer()
      return
    }
    loading.value = true
    try {
      const result = await fetchCloudFileUrlQuery(fileId.value, { force })
      if (result.fileId !== fileId.value) {
        return
      }
      url.value = result.url
      scheduleRefresh(result)
    } catch (error) {
      if (fileId.value === nextFileId) {
        url.value = ''
      }
      console.error('获取文件URL失败:', error)
    } finally {
      if (fileId.value === nextFileId) {
        loading.value = false
      }
    }
  }

  async function refresh() {
    await invalidateCloudFileUrlQuery(fileId.value)
    return resolve(fileId.value, { force: true })
  }

  if (initialFileId) {
    resolve()
  }
  if (getCurrentInstance()) {
    onBeforeUnmount(clearRefreshTimer)
  }

  return { fileId, url, loading, resolve, refresh }
}
