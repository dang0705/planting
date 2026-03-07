import { ref } from 'vue'

/**
 * 批量将 fileId 转换为临时 URL
 * @param {string[]} fileIds - 云存储文件 ID 数组
 * @returns {Promise<Record<string, string>>} fileId -> tempUrl 映射
 */
export async function getFileUrls(fileIds) {
  const ids = fileIds.filter(Boolean)
  if (!ids.length) return {}
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: ids })
    const map = {}
    res.fileList?.forEach(f => {
      if (f.fileID && f.tempFileURL) map[f.fileID] = f.tempFileURL
    })
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
  if (!fileId) return ''
  const map = await getFileUrls([fileId])
  return map[fileId] || ''
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

  async function resolve(id) {
    if (id) fileId.value = id
    if (!fileId.value) {
      url.value = ''
      return
    }
    loading.value = true
    url.value = await getFileUrl(fileId.value)
    loading.value = false
  }

  if (initialFileId) resolve()

  return { fileId, url, loading, resolve }
}
