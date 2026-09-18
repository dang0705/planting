import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  collectCatalogImageRefs,
  isRestrictedCatalogPlatform,
  mapCatalogPlantsForPlatform,
  normalizeCatalogImageRef,
  resolveCatalogImageUrls
} = require('../../../../../cloudfunctions/layer/utils/catalog-image-url.js')

const validRef =
  'cloud://cloud1-2grufevs395a9d5e.636c-cloud1-2grufevs395a9d5e-1403815561/plants/绿萝.jpg'

assert.equal(normalizeCatalogImageRef(validRef), validRef)
assert.equal(normalizeCatalogImageRef('https://example.com/plant.jpg'), '')
assert.equal(normalizeCatalogImageRef('cloud://bucket/other/plant.jpg'), '')
assert.deepEqual(
  collectCatalogImageRefs([
    { imageFileId: validRef },
    { imageFileId: validRef },
    { imageFileId: 'cloud://bucket/plants/虎皮兰.jpg' },
    { imageFileId: 'https://example.com/plant.jpg' }
  ]),
  [validRef, 'cloud://bucket/plants/虎皮兰.jpg']
)

const calls = []
const resolved = await resolveCatalogImageUrls(
  [{ imageFileId: validRef }, { imageFileId: validRef }],
  {
    maxAge: 7200,
    app: {
      async getTempFileURL(payload) {
        calls.push(payload)
        return {
          fileList: [
            {
              fileID: validRef,
              tempFileURL: 'https://temp.example.com/plant.jpg'
            }
          ]
        }
      }
    }
  }
)

assert.equal(calls.length, 1)
assert.deepEqual(calls[0], { fileList: [validRef], maxAge: 7200 })
assert.equal(resolved.get(validRef), 'https://temp.example.com/plant.jpg')
assert.equal(isRestrictedCatalogPlatform('douyin_mp'), true)
assert.equal(isRestrictedCatalogPlatform('wechat_mp'), false)
assert.deepEqual(
  mapCatalogPlantsForPlatform(
    { id: '1', imageFileId: validRef, image: 'stale', photos: [validRef] },
    { platform: 'douyin_mp', imageUrls: resolved }
  ),
  {
    id: '1',
    imageUrl: 'https://temp.example.com/plant.jpg',
    imageSource: 'catalog'
  }
)
assert.deepEqual(
  mapCatalogPlantsForPlatform(
    { id: '1', imageFileId: validRef },
    { platform: 'douyin_mp', imageUrls: new Map() }
  ),
  { id: '1' }
)

const failed = await resolveCatalogImageUrls([{ imageFileId: validRef }], {
  app: {
    async getTempFileURL() {
      throw new Error('storage unavailable')
    }
  }
})
assert.equal(failed.size, 0)

console.log('catalog image URL resolver tests passed data_mode=unit_fake')
