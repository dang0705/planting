'use strict'

const { getCloudBase } = require('/opt/utils/cloudbase')

function parseCloudStorageUrlToFileId(imageRef = '') {
  const normalized = String(imageRef || '').trim()
  if (!normalized || !/^https?:\/\//i.test(normalized)) {return ''}

  try {
    const url = new URL(normalized)
    const host = String(url.hostname || '').trim()
    const match = host.match(/^(.+?)-(\d+)\.tcb\.qcloud\.la$/i)
    if (!match) {return ''}

    const bucketPrefix = match[1]
    const appId = match[2]
    const envId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || ''
    const pathname = decodeURIComponent(url.pathname || '').replace(/^\/+/, '')
    if (!envId || !bucketPrefix || !appId || !pathname) {return ''}

    return `cloud://${envId}.${bucketPrefix}-${appId}/${pathname}`
  } catch {
    return ''
  }
}

function isFreshCloudStorageSignedUrl(imageRef = '', maxAge = 3600) {
  const normalized = String(imageRef || '').trim()
  if (!parseCloudStorageUrlToFileId(normalized)) {return true}

  try {
    const url = new URL(normalized)
    const signedAt = Number(url.searchParams.get('t') || 0)
    if (!Number.isFinite(signedAt) || signedAt <= 0) {return false}

    const now = Math.floor(Date.now() / 1000)
    const allowedAge = Math.max(60, Number(maxAge || 3600))
    return signedAt >= now - allowedAge && signedAt <= now + allowedAge
  } catch {
    return false
  }
}

async function refreshCloudStorageImageUrl(imageRef = '', maxAge = 3600) {
  const fileId = parseCloudStorageUrlToFileId(imageRef)
  if (!fileId) {return ''}

  const result = await getCloudBase().getTempFileURL({
    fileList: [fileId],
    maxAge: Number(maxAge || 3600)
  })
  const file = result?.fileList?.[0] || null
  if (String(file?.code || '').toUpperCase() !== 'SUCCESS') {
    return ''
  }
  const refreshedUrl = String(file?.tempFileURL || file?.download_url || '').trim()
  return isFreshCloudStorageSignedUrl(refreshedUrl, maxAge) ? refreshedUrl : ''
}

module.exports = {
  parseCloudStorageUrlToFileId,
  isFreshCloudStorageSignedUrl,
  refreshCloudStorageImageUrl
}
