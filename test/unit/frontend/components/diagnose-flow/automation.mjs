import assert from 'node:assert/strict'

import { useDiagnoseAutomation } from '../../../../../src/components/diagnose-flow/automation.js'
import { useDiagnoseImages } from '../../../../../src/components/diagnose-flow/images.js'

function createAutomationHarness() {
  const imageFiles = { value: [] }
  const pendingDiagnosePayload = { value: { stale: true } }
  const result = { value: { stale: true } }
  const slotHelpers = {
    normalizeSlotType: (slotType = '', fallback = 'unknown') =>
      ['leaf', 'stem', 'whole_plant'].includes(String(slotType || '').trim())
        ? String(slotType || '').trim()
        : fallback,
    buildSlotMetadata: (slotType = 'unknown', index = 0) => ({
      inputSlotType: slotType,
      inputSlotLabel: `图${index + 1}`,
      userDeclaredOrganType: slotType,
      userDeclaredOrganConfidence: 0.95
    })
  }

  const automation = useDiagnoseAutomation({
    imageFiles,
    pendingDiagnosePayload,
    result,
    PRIMARY_IMAGE_LIMIT: 3,
    automationEnabled: true,
    ...slotHelpers
  })
  const images = useDiagnoseImages({
    props: {},
    imageFiles,
    hasPendingUploads: { value: false },
    hasUploadErrors: { value: false },
    ...slotHelpers
  })

  return {
    automation,
    images,
    imageFiles,
    pendingDiagnosePayload,
    result
  }
}

{
  const { automation, images, imageFiles, pendingDiagnosePayload, result } =
    createAutomationHarness()

  const injected = automation.injectAutomationDiagnoseImages({
    images: [
      {
        imageRef: 'https://example.invalid/e2e-pest-leaf.jpg',
        inputSlotType: 'leaf',
        captureRegion: 'leaf_lower_surface'
      }
    ]
  })

  assert.equal(injected.count, 1)
  assert.equal(injected.images[0].imageRef, 'https://example.invalid/e2e-pest-leaf.jpg')
  assert.equal(injected.images[0].inputSlotType, 'leaf')
  assert.equal(injected.images[0].captureRegion, 'leaf_lower_surface')
  assert.equal(imageFiles.value[0].captureRegion, 'leaf_lower_surface')
  assert.equal(
    images.buildStructuredImageInputs(imageFiles.value)[0].captureRegion,
    'leaf_lower_surface'
  )
  assert.equal(pendingDiagnosePayload.value, null)
  assert.equal(result.value, null)
}

{
  const { automation, images, imageFiles } = createAutomationHarness()

  const injected = automation.injectAutomationDiagnoseImages({
    images: [
      {
        imageRef: 'https://example.invalid/old-slot-payload.jpg',
        inputSlotType: 'stem'
      }
    ]
  })

  assert.equal(injected.count, 1)
  assert.equal(injected.images[0].inputSlotType, 'stem')
  assert.equal(Object.hasOwn(injected.images[0], 'captureRegion'), false)
  assert.equal(Object.hasOwn(imageFiles.value[0], 'captureRegion'), false)
  assert.equal(
    Object.hasOwn(images.buildStructuredImageInputs(imageFiles.value)[0], 'captureRegion'),
    false
  )
}

console.log('diagnose flow automation tests passed')
