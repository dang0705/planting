// data_mode=unit_fake; test_kind=source_contract. Expected comes from the approved watering flow:
// uploaded soil photos must expose a page-level bottom confirmation, and every visual result,
// including wet soil, must expose the next-step button that opens the existing wet confirmation.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/subpackages/care/watering-advisor/watering-advisor.vue'),
  'utf8'
)

assert.match(source, /soilEvidenceAwaitingAnalysis/u)
assert.match(source, /id="watering-soil-confirm-analysis-button"/u)
assert.match(source, /@click="startSoilPhotoAnalysis"/u)
assert.match(source, /soilEvidence\?\.evidenceId/u)
assert.match(source, /soilEvidenceCanContinue/u)
assert.match(source, /@step-change="resetWateringStepScroll"/u)
assert.match(source, /:scroll-top="stepScrollTop"/u)
assert.match(source, /:scroll-with-animation="false"/u)
assert.match(source, /!soilEvidenceCanContinue \|\| computing/u)
assert.match(source, /id="watering-soil-continue-button"/u)
assert.match(source, /@click="continueSoilEvidence"/u)

console.log('watering advisor soil footer contract passed')
