import { queryClient } from '@/lib/query-client.js'

export const CLOUD_FILE_URL_QUERY_KEY = ['cloud-storage', 'temp-file-url']
export const TEMP_FILE_URL_STALE_TIME_MS = 50 * 60 * 1000
export const TEMP_FILE_URL_GC_TIME_MS = 2 * 60 * 60 * 1000
export const TEMP_FILE_URL_DEFAULT_TTL_MS = 60 * 60 * 1000
const CLOUD_STORAGE_BATCH_LIMIT = 50

const pendingRequests = new Map()
let batchFlushScheduled = false

function normalizeFileId(fileId) {
  return String(fileId || '').trim()
}

export function buildCloudFileUrlQueryKey(fileId) {
  return [...CLOUD_FILE_URL_QUERY_KEY, normalizeFileId(fileId)]
}

export function buildCloudFileUrlQueryOptions(fileId) {
  const normalizedFileId = normalizeFileId(fileId)
  return {
    queryKey: buildCloudFileUrlQueryKey(normalizedFileId),
    queryFn: () => requestCloudFileUrl(normalizedFileId),
    staleTime: TEMP_FILE_URL_STALE_TIME_MS,
    gcTime: TEMP_FILE_URL_GC_TIME_MS,
    retry: 1
  }
}

function requestCloudFileUrl(fileId) {
  if (!fileId) {
    return Promise.resolve({ fileId: '', url: '', expiresAt: 0 })
  }

  return new Promise((resolve, reject) => {
    const entry = pendingRequests.get(fileId) || { resolvers: [] }
    entry.resolvers.push({ resolve, reject })
    pendingRequests.set(fileId, entry)
    scheduleBatchFlush()
  })
}

function scheduleBatchFlush() {
  if (batchFlushScheduled) {
    return
  }
  batchFlushScheduled = true
  Promise.resolve().then(flushPendingRequests)
}

async function flushPendingRequests() {
  batchFlushScheduled = false
  const entries = [...pendingRequests.entries()]
  pendingRequests.clear()

  for (let index = 0; index < entries.length; index += CLOUD_STORAGE_BATCH_LIMIT) {
    const chunk = entries.slice(index, index + CLOUD_STORAGE_BATCH_LIMIT)
    try {
      const response = await wx.cloud.getTempFileURL({
        fileList: chunk.map(([fileId]) => fileId)
      })
      const responseItems = response?.fileList || []
      for (const [fileId, entry] of chunk) {
        const item = responseItems.find(file => (file?.fileID || file?.fileId) === fileId)
        const url = item?.tempFileURL || ''
        if (!url) {
          const error = new Error(item?.status || `无法获取图片链接：${fileId}`)
          entry.resolvers.forEach(({ reject }) => reject(error))
          continue
        }
        const result = {
          fileId,
          url,
          expiresAt: Date.now() + TEMP_FILE_URL_DEFAULT_TTL_MS
        }
        entry.resolvers.forEach(({ resolve }) => resolve(result))
      }
    } catch (error) {
      for (const [, entry] of chunk) {
        entry.resolvers.forEach(({ reject }) => reject(error))
      }
    }
  }
}

export function fetchCloudFileUrlQuery(fileId, { force = false } = {}) {
  const normalizedFileId = normalizeFileId(fileId)
  if (!normalizedFileId) {
    return Promise.resolve({ fileId: '', url: '', expiresAt: 0 })
  }

  const options = buildCloudFileUrlQueryOptions(normalizedFileId)
  return queryClient.fetchQuery(force ? { ...options, staleTime: 0 } : options)
}

export function invalidateCloudFileUrlQuery(fileId) {
  const normalizedFileId = normalizeFileId(fileId)
  if (!normalizedFileId) {
    return Promise.resolve()
  }
  return queryClient.invalidateQueries({ queryKey: buildCloudFileUrlQueryKey(normalizedFileId) })
}
