'use strict'

const DEFAULT_CATALOG_IMAGE_MAX_AGE_SECONDS = 7200
const RESTRICTED_CATALOG_PLATFORMS = new Set(['douyin_mp', 'xiaohongshu_mp'])

function normalizeCatalogImageRef(value) {
  const normalized = String(value || '').trim()
  if (!/^cloud:\/\/[^\s/]+\/plants\//.test(normalized)) {
    return ''
  }
  return normalized
}

function collectCatalogImageRefs(items = []) {
  return [
    ...new Set(
      (Array.isArray(items) ? items : [])
        .map(item => normalizeCatalogImageRef(item?.imageFileId))
        .filter(Boolean)
    )
  ]
}

function isRestrictedCatalogPlatform(platform) {
  return RESTRICTED_CATALOG_PLATFORMS.has(String(platform || '').trim())
}

function compactCatalogPlantForRestrictedPlatform(item = {}, imageUrls = new Map()) {
  const payload = { ...item }
  const imageFileId = normalizeCatalogImageRef(item?.imageFileId)
  delete payload.imageFileId
  delete payload.image
  delete payload.photos

  const imageUrl = String(imageUrls.get(imageFileId) || '').trim()
  if (imageUrl) {
    payload.imageUrl = imageUrl
    payload.imageSource = 'catalog'
  } else {
    delete payload.imageUrl
    delete payload.imageSource
  }
  return payload
}

function mapCatalogPlantsForPlatform(value, { platform = '', imageUrls = new Map() } = {}) {
  if (!value || !isRestrictedCatalogPlatform(platform)) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => compactCatalogPlantForRestrictedPlatform(item, imageUrls))
  }
  return compactCatalogPlantForRestrictedPlatform(value, imageUrls)
}

/**
 * 将目录里的稳定 cloud:// 文件引用转换为当前 CloudBase 环境的临时 HTTPS 地址。
 * 只接收 plant-knowledge 已解析出的目录封面引用，不接受客户端传入的任意 fileId。
 * 单张图片解析失败时保留植物列表，调用方可使用无图占位，不影响 CRUD 主链路。
 */
async function resolveCatalogImageUrls(
  items = [],
  { app, maxAge = DEFAULT_CATALOG_IMAGE_MAX_AGE_SECONDS } = {}
) {
  const fileIds = collectCatalogImageRefs(items)
  if (!fileIds.length || typeof app?.getTempFileURL !== 'function') {
    return new Map()
  }

  try {
    const result = await app.getTempFileURL({
      fileList: fileIds,
      maxAge
    })
    const resolved = new Map()
    for (const item of result?.fileList || []) {
      const fileId = normalizeCatalogImageRef(item?.fileID || item?.fileId)
      const tempUrl = String(item?.tempFileURL || '').trim()
      if (fileId && /^https?:\/\//i.test(tempUrl)) {
        resolved.set(fileId, tempUrl)
      }
    }
    return resolved
  } catch (error) {
    console.error('catalog image URL resolve failed:', {
      count: fileIds.length,
      message: String(error?.message || error || '')
    })
    return new Map()
  }
}

module.exports = {
  DEFAULT_CATALOG_IMAGE_MAX_AGE_SECONDS,
  normalizeCatalogImageRef,
  collectCatalogImageRefs,
  resolveCatalogImageUrls,
  isRestrictedCatalogPlatform,
  mapCatalogPlantsForPlatform
}
