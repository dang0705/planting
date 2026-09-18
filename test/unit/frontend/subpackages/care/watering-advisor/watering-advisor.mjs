// data_mode=unit_fake; test_kind=source_contract. Runtime flow remains an Automator live-QA item.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/subpackages/care/watering-advisor/watering-advisor.vue'),
  'utf8'
)

assert.match(source, /cleanupAdhocSoilEvidenceAfterClientFailure/u)
assert.match(source, /cleanupTemporaryWateringSoilEvidence\(evidenceId\)/u)
assert.match(source, /requestStorageFileDelete\(\{ fileId \}\)/u)
assert.match(source, /if \(!selectedCatalogPlant\.value\?\.userPlantId\)/u)
assert.match(source, /import \{ onShow, onUnload \} from '@dcloudio\/uni-app'/u)
assert.match(
  source,
  /async function finishIndependentAdvisor\(\) \{[\s\S]{0,500}confirmSaveIndependentPlant\(\)/u
)
assert.match(
  source,
  /async function finishAdvisor\(\) \{[\s\S]{0,260}await finishIndependentAdvisor\(\)/u
)
assert.match(
  source,
  /onUnload\(\(\) => \{[\s\S]{0,220}cleanupAdhocSoilEvidenceAfterClientFailure\(\)/u
)
assert.match(source, /amountText \|\| '暂无建议'/u)
assert.match(source, /<WateringSoilVisualDecision/u)
assert.match(source, /result-label="盆土综合判断"/u)
assert.match(source, /action-label="浇水建议"/u)
assert.doesNotMatch(source, /id="watering-advisor-result-soil-wet-hold"/u)
assert.doesNotMatch(source, /id="watering-advisor-result-soil-check"/u)
assert.doesNotMatch(source, /id="watering-advisor-result-soil-source"/u)
assert.match(source, /@change="handleSoilEvidenceChange"/u)
assert.match(source, /上传\/分析完成即同步父页面的当前证据/u)
assert.match(
  source,
  /async function handleSoilEvidenceReady\(value\) \{\s*if \(computing\.value \|\| independentExitPending\.value\)/u
)
assert.doesNotMatch(source, /confirmWetSoilAdvice\(\)/u)
assert.doesNotMatch(source, /hasVisibleWetSoil\(value\?\.review\)/u)
assert.doesNotMatch(source, /soilEvidence\.value = \{ \.\.\.value, forced: true \}/u)
assert.match(source, /forced: soilEvidence\.value\.forced === true/u)
assert.match(source, /:show-continue="false"/u)
assert.match(source, /ref="soilEvidenceStageRef"/u)
assert.match(
  source,
  /activeStep === soilEvidenceStep[\s\S]{0,140}soilEvidence\?\.evidenceId[\s\S]{0,100}!computing/u
)
assert.match(source, /id="watering-soil-continue-button"/u)
assert.match(
  source,
  /function continueSoilEvidence\(\)[\s\S]{0,180}soilEvidenceContinueRequest\.value \+= 1/u
)
assert.match(source, /callComponentMethod\(soilEvidenceStageRef, 'startPhotoAnalysis'\)/u)
assert.match(source, /function resetSoilEvidenceSubmission\(\)[\s\S]{0,140}resetSubmissionGuard/u)
assert.match(source, /callComponentMethod\(soilEvidenceStageRef, 'resetSubmissionGuard'\)/u)
assert.match(source, /async function goToResult\(\) \{[\s\S]{0,260}if \(computing\.value\)/u)
assert.match(source, /class="flex min-w-0 flex-1 flex-col items-center"/u)
assert.match(source, /class="mt-1 whitespace-nowrap text-\[12px\] leading-4"/u)
assert.match(source, /class="mx-1 mt-3 h-\[1px\] flex-1 bg-\[#dbe7de\]"/u)

console.log('independent watering temporary soil evidence cleanup contract passed')
