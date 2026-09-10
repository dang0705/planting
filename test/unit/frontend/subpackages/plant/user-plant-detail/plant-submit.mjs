import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/components/plant-submit.js'),
  'utf8'
)
const uploads = []
const transformed = source
  .replace(
    "import { uploadPlantImage } from '@/api/storage.js'",
    "const uploadPlantImage = async (...args) => { globalThis.__plantSubmitUploads.push(args); return { fileId: 'uploaded-file' } }"
  )
  .replace(
    "import { normalizeOptionalLightEnvironment } from '@/utils/light-environment.js'",
    'const normalizeOptionalLightEnvironment = value => value'
  )

globalThis.__plantSubmitUploads = uploads
const originalUni = globalThis.uni
globalThis.uni = { showLoading: () => {}, hideLoading: () => {} }
try {
  const { buildPlantSubmitPayload, buildRestrictedManualPlantPayload } = await import(
    `data:text/javascript,${encodeURIComponent(transformed)}`
  )
  const reused = await buildPlantSubmitPayload({
    formData: {
      image: 'wxfile://local-photo',
      imageFileId: 'cloud://existing-file',
      careLocation: { city: '上海' },
      plantDate: '2026-08-28',
      notes: ''
    },
    selectedPlant: { id: 'plant-1', canonicalName: '绿萝' },
    userId: 'wx_owner'
  })
  assert.deepEqual(reused.photos, ['cloud://existing-file'])
  assert.equal(uploads.length, 0)

  const uploaded = await buildPlantSubmitPayload({
    formData: {
      image: 'wxfile://new-photo',
      imageFileId: '',
      careLocation: { city: '上海' },
      plantDate: '2026-08-28',
      notes: ''
    },
    selectedPlant: { id: 'plant-1', canonicalName: '绿萝' },
    userId: 'wx_owner'
  })
  assert.deepEqual(uploaded.photos, ['uploaded-file'])
  assert.equal(uploads.length, 1)

  const restricted = buildRestrictedManualPlantPayload({
    formData: {
      nickname: '窗边绿萝',
      careLocation: { cityName: '上海市' },
      plantDate: '2026-08-28',
      notes: '每周观察一次',
      image: 'wxfile://must-not-upload',
      photos: ['must-not-send']
    },
    recognizedName: '绿萝',
    recordVersion: 3
  })
  assert.deepEqual(restricted, {
    nickname: '窗边绿萝',
    recognizedName: '绿萝',
    location: '上海市',
    plantDate: '2026-08-28',
    notes: '每周观察一次',
    sourceType: 'manual',
    recordVersion: 3
  })
} finally {
  globalThis.uni = originalUni
  delete globalThis.__plantSubmitUploads
}

console.log('plant submit image reuse tests passed')
