/**
 * data_mode=unit_fake
 * test_kind=unit_logic
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const EXPECTED_PREVIEW_CALL_COUNT = 1
const originalUni = globalThis.uni
const previewCalls = []
globalThis.uni = {
  previewImage(options) {
    previewCalls.push(options)
  }
}

try {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'src/utils/diagnosis-image-preview.js')
  ).href
  const { previewDiagnosisImage } = await import(moduleUrl)

  assert.equal(
    previewDiagnosisImage({ previewUrl: 'leaf-image' }, [
      { previewUrl: 'leaf-image' },
      { previewUrl: 'soil-image' },
      { previewUrl: 'leaf-image' }
    ]),
    true
  )
  assert.deepEqual(previewCalls, [
    {
      current: 'leaf-image',
      urls: ['leaf-image', 'soil-image']
    }
  ])
  assert.equal(previewDiagnosisImage({ previewUrl: '' }, [{ previewUrl: 'soil-image' }]), false)
  assert.equal(previewCalls.length, EXPECTED_PREVIEW_CALL_COUNT)
} finally {
  globalThis.uni = originalUni
}
