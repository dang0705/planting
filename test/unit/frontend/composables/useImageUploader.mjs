import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { useImageUploader } from '../../../../src/composables/useImageUploader.js'

const repoRoot = process.cwd()
const cloudUploaderSource = fs.readFileSync(
  path.join(repoRoot, 'src/composables/useCloudImageUploader.js'),
  'utf8'
)
const helperStart = cloudUploaderSource.indexOf('const QWEN_VISUAL_PATCH_SIZE')
const helperEnd = cloudUploaderSource.indexOf('function guessMimeType')
assert.ok(helperStart >= 0 && helperEnd > helperStart)
const helperSource = cloudUploaderSource.slice(helperStart, helperEnd).replaceAll('export ', '')
const { resolveImagePixelBudget, prepareImageForPixelBudget } = new Function(
  `${helperSource}
return { resolveImagePixelBudget, prepareImageForPixelBudget }`
)()

const MAX_PIXELS = 1638400
const ALIGNMENT = 32

const small = resolveImagePixelBudget({
  width: 640,
  height: 480,
  maxPixels: MAX_PIXELS,
  alignment: ALIGNMENT
})
assert.equal(small.resized, false)
assert.deepEqual([small.width, small.height], [640, 480])

const landscape = resolveImagePixelBudget({
  width: 3635,
  height: 2467,
  maxPixels: MAX_PIXELS,
  alignment: ALIGNMENT
})
assert.deepEqual([landscape.width, landscape.height], [1536, 1056])
assert.equal(landscape.outputPixelCount <= MAX_PIXELS, true)
assert.equal(landscape.width % ALIGNMENT, 0)
assert.equal(landscape.height % ALIGNMENT, 0)
assert.equal(landscape.estimatedQwenVisualTokens <= 1602, true)
assert.equal(landscape.estimatedQwenVisualTokens, 1586)
assert.equal(Math.abs(landscape.width / landscape.height - 3635 / 2467) < 0.02, true)

const portrait = resolveImagePixelBudget({
  width: 2467,
  height: 3635,
  maxPixels: MAX_PIXELS,
  alignment: ALIGNMENT
})
assert.deepEqual([portrait.width, portrait.height], [1056, 1536])
assert.equal(portrait.outputPixelCount <= MAX_PIXELS, true)

const square = resolveImagePixelBudget({
  width: 4000,
  height: 4000,
  maxPixels: MAX_PIXELS,
  alignment: ALIGNMENT
})
assert.deepEqual([square.width, square.height], [1280, 1280])
assert.equal(square.outputPixelCount, MAX_PIXELS)
assert.equal(square.estimatedQwenVisualTokens, 1602)

const imageInfoByPath = new Map([
  ['source.jpg', { width: 3635, height: 2467 }],
  ['pixel-budget.jpg', { width: 1536, height: 1056 }],
  ['small.jpg', { width: 640, height: 480 }],
  ['quality-72.jpg', { width: 1536, height: 1056 }],
  ['quality-68.jpg', { width: 1536, height: 1056 }]
])
const fileSizeByPath = new Map([
  ['source.jpg', 4 * 1024 * 1024],
  ['pixel-budget.jpg', 1024 * 1024],
  ['small.jpg', 200 * 1024],
  ['quality-72.jpg', 500 * 1024],
  ['quality-68.jpg', 400 * 1024]
])
const compressionCalls = []

globalThis.wx = {
  getImageInfo({ src, success, fail }) {
    const info = imageInfoByPath.get(src)
    if (info) {
      success(info)
    } else {
      fail(new Error('missing image info'))
    }
  },
  compressImage(options) {
    compressionCalls.push(options)
    if (options.compressedWidth || options.compressedHeight) {
      options.success({ tempFilePath: 'pixel-budget.jpg' })
      return
    }
    options.success({ tempFilePath: `quality-${options.quality}.jpg` })
  },
  getFileSystemManager() {
    return {
      stat({ path: filePath, success, fail }) {
        const size = fileSizeByPath.get(filePath)
        if (size) {
          success({ stats: { size } })
        } else {
          fail(new Error('missing file'))
        }
      }
    }
  }
}

const prepared = await prepareImageForPixelBudget('source.jpg', {
  maxPixels: MAX_PIXELS,
  alignment: ALIGNMENT
})
assert.equal(prepared.filePath, 'pixel-budget.jpg')
assert.deepEqual(
  [compressionCalls[0].compressedWidth, compressionCalls[0].compressedHeight],
  [1536, 1056]
)
assert.equal(prepared.compression.sourceWidth, 3635)
assert.equal(prepared.compression.sourceHeight, 2467)
assert.equal(prepared.compression.width, 1536)
assert.equal(prepared.compression.height, 1056)
assert.equal(prepared.compression.outputPixelCount, 1536 * 1056)
assert.equal(prepared.compression.estimatedQwenVisualTokens, 1586)

const untouched = await prepareImageForPixelBudget('small.jpg', {
  maxPixels: MAX_PIXELS,
  alignment: ALIGNMENT
})
assert.equal(untouched.filePath, 'small.jpg')
assert.equal(untouched.compression.resized, false)
assert.equal(compressionCalls.length, 1)

globalThis.uni = {
  chooseImage({ success }) {
    success({ tempFilePaths: ['source.jpg'] })
  },
  showToast() {}
}

let uploadedCompression = null
const uploader = useImageUploader({
  count: 1,
  size: 5,
  suffix: ['jpg'],
  compressionRate: 72,
  compressionTargetSize: 0.45,
  forceCompression: true,
  minimumCompressionQuality: 68,
  prepareImage: filePath =>
    prepareImageForPixelBudget(filePath, {
      maxPixels: MAX_PIXELS,
      alignment: ALIGNMENT
    }),
  uploadExecutor: async ({ compression }) => {
    uploadedCompression = compression
    return { tempUrl: 'https://example.test/image.jpg' }
  }
})

await uploader.chooseAndUpload()
assert.deepEqual(
  compressionCalls.slice(2).map(item => item.quality),
  [72, 68]
)
assert.equal(uploadedCompression.minimumQuality, 68)
assert.equal(uploadedCompression.quality, 68)
assert.equal(uploadedCompression.originalSize, 4 * 1024 * 1024)
assert.equal(uploadedCompression.width, 1536)
assert.equal(uploadedCompression.height, 1056)
assert.equal(uploadedCompression.sourceWidth, 3635)
assert.equal(uploadedCompression.sourceHeight, 2467)
assert.equal(uploadedCompression.sourcePixelCount, 3635 * 2467)
assert.equal(uploadedCompression.outputPixelCount <= MAX_PIXELS, true)

console.log('image uploader pixel budget tests passed')
