import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const repoRoot = process.cwd()
const {
  UPLOAD_COMPRESSION_NUMBER_FIELDS,
  normalizeUploadCompression
} = require('../../../../../cloudfunctions/diagnose-http/utils/upload-compression.js')

const source = {
  source: ' client_upload_before_cloud_storage ',
  compressed: true,
  resized: true,
  originalSizeBytes: 4194304,
  uploadedSizeBytes: 409600,
  compressionRatio: 0.098,
  quality: 68,
  width: 1536,
  height: 1056,
  sourceWidth: 3635,
  sourceHeight: 2467,
  sourcePixelCount: 8967545,
  outputPixelCount: 1622016,
  maxPixels: 1638400,
  pixelAlignment: 32,
  estimatedQwenVisualTokens: 1584,
  targetSizeBytes: 471859,
  minimumQuality: 68,
  preserveImageDetails: false,
  doubleConfirmedForHunyuan: true,
  ignoredField: 'not persisted'
}
const normalized = normalizeUploadCompression(source)

assert.equal(normalizeUploadCompression(null), null)
assert.equal(normalizeUploadCompression('invalid'), null)
assert.equal(normalized.source, 'client_upload_before_cloud_storage')
assert.equal(normalized.resized, true)
assert.equal(normalized.sourceWidth, 3635)
assert.equal(normalized.sourceHeight, 2467)
assert.equal(normalized.sourcePixelCount, 8967545)
assert.equal(normalized.outputPixelCount, 1622016)
assert.equal(normalized.maxPixels, 1638400)
assert.equal(normalized.pixelAlignment, 32)
assert.equal(normalized.estimatedQwenVisualTokens, 1584)
assert.equal(Object.hasOwn(normalized, 'ignoredField'), false)
assert.deepEqual(
  UPLOAD_COMPRESSION_NUMBER_FIELDS.filter(field => normalized[field] === source[field]),
  UPLOAD_COMPRESSION_NUMBER_FIELDS
)

const invalidNumbers = normalizeUploadCompression({
  width: 0,
  height: -1,
  sourcePixelCount: 'not-a-number'
})
assert.equal(invalidNumbers.width, null)
assert.equal(invalidNumbers.height, null)
assert.equal(invalidNumbers.sourcePixelCount, null)

for (const relativePath of [
  'cloudfunctions/diagnose-http/app/request-normalizers.js',
  'cloudfunctions/diagnose-http/services/visual-diagnosis-service.js',
  'cloudfunctions/diagnose-http/utils/llm.js'
]) {
  const consumerSource = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
  assert.match(
    consumerSource,
    /require\('\.\.\/utils\/upload-compression'\)|require\('\.\/upload-compression'\)/
  )
  assert.doesNotMatch(consumerSource, /function normalizeUploadCompression/)
}

console.log('upload compression normalization tests passed')
