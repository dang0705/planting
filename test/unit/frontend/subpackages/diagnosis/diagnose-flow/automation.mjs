import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const automationSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/diagnose-flow/automation.js'),
  'utf8'
)
const imagesSource = fs
  .readFileSync(path.join(repoRoot, 'src/subpackages/diagnosis/diagnose-flow/images.js'), 'utf8')
  .replace(
    "import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'",
    'const ANALYTICS_EVENTS = {}; const reportAnalyticsEvent = () => {}'
  )
  .replace(
    "import { buildStructuredImageInputs } from '@/utils/diagnose-structured-images.js'",
    `const buildStructuredImageInputs = files =>
      files.map((item, index) => ({
        imageRef: item.uploaded?.tempUrl || item.uploaded?.url || '',
        inputSlotType: item.inputSlotType || 'unknown',
        orderIndex: index,
        ...(item.captureRegion ? { captureRegion: item.captureRegion } : {})
      }))`
  )
  .replace(
    "import { requireMvpAccess } from '@/utils/subscription-access.js'",
    'const requireMvpAccess = async () => true'
  )
  .replace(
    /import \{\s*VISUAL_SCAN_ERROR_TEXT,\s*VISUAL_SCAN_LOADING_TEXT\s*\} from '\.\/constants\.js'/,
    "const VISUAL_SCAN_LOADING_TEXT = '正在检查照片...'; const VISUAL_SCAN_ERROR_TEXT = '暂时无法完成，请检查网络后重试。'"
  )
const { useDiagnoseAutomation } = await import(
  `data:text/javascript,${encodeURIComponent(automationSource)}`
)
const { useDiagnoseImages } = await import(
  `data:text/javascript,${encodeURIComponent(imagesSource)}`
)

function createAutomationHarness() {
  const imageFiles = { value: [] }
  const pendingDiagnosePayload = { value: { stale: true } }
  const result = { value: { stale: true } }
  const primaryStructuredImages = { value: [] }
  const visualScanning = { value: false }
  const visualScanText = { value: '' }
  const submittedDiagnoses = []
  let quotaUsageCount = 0
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
    userStore: {
      useAIQuota() {
        quotaUsageCount += 1
      }
    },
    imageFiles,
    hasPendingUploads: { value: false },
    hasUploadErrors: { value: false },
    primaryStructuredImages,
    pendingDiagnosePayload,
    hasSelectedSymptomMode: { value: false },
    visualScanning,
    visualScanText,
    diagnoseMutation: {
      async mutateAsync(payload) {
        submittedDiagnoses.push(payload)
        payload.onFinish?.()
        return { diagnosisSessionId: `session_${submittedDiagnoses.length}` }
      }
    },
    completeVisualDiagnosis(resultPayload) {
      result.value = resultPayload
    },
    ...slotHelpers
  })

  return {
    automation,
    images,
    imageFiles,
    pendingDiagnosePayload,
    result,
    primaryStructuredImages,
    visualScanning,
    submittedDiagnoses,
    getQuotaUsageCount: () => quotaUsageCount
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

{
  const {
    images,
    imageFiles,
    primaryStructuredImages,
    visualScanning,
    submittedDiagnoses,
    getQuotaUsageCount
  } = createAutomationHarness()
  imageFiles.value = [
    {
      uploaded: { tempUrl: 'https://example.invalid/full.jpg' },
      inputSlotType: 'leaf'
    }
  ]
  primaryStructuredImages.value = images.buildStructuredImageInputs(imageFiles.value)

  await images.startDiagnose()

  assert.equal(submittedDiagnoses.length, 1)
  assert.equal(submittedDiagnoses[0].diagnosisProfile, 'full')
  assert.equal(visualScanning.value, false)
  assert.equal(getQuotaUsageCount(), 1)
}

console.log('diagnose flow automation tests passed data_mode=unit_fake')
