import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  DYNAMIC_TASK_MARKER,
  buildCacheFirstVisualPrompt
} = require('../../../../../cloudfunctions/diagnose-http/utils/visual-prompt-cache-contract.js')
const {
  parseLLMVisualResult
} = require('../../../../../cloudfunctions/diagnose-http/utils/diagnosis-parser.js')
const {
  VISUAL_OUTPUT_SCHEMA_TEXT
} = require('../../../../../cloudfunctions/diagnose-http/utils/visual-contract.js')
const { llm } = require('../../../../../cloudfunctions/diagnose-http/configs/index.js')
const {
  FORMAL_PEST_VISUAL_EVIDENCE_KEYS,
  PEST_EVIDENCE_RULES,
  PEST_MODE_KEYS,
  PEST_VISUAL_RULES
} = require('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-mode-registry.js')
const {
  compilePestVisualMapping
} = require('../../../../../cloudfunctions/diagnose-http/utils/visual-prompt-static-rules.js')
const {
  normalizeLlmImageTaskContext,
  withLlmImagePromptContext
} = require('../../../../../cloudfunctions/diagnose-http/utils/llm-image-context.js')
const symptomRepositoryPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/repositories/symptom-repository.js')
const originalSymptomRepository = require.cache[symptomRepositoryPath]
require.cache[symptomRepositoryPath] = {
  id: symptomRepositoryPath,
  filename: symptomRepositoryPath,
  loaded: true,
  exports: {
    getPromptSymptomDictionary: async () => [
      {
        symptomKey: 'yellow_speckling',
        symptomCn: '点状黄化',
        displayTextCn: '点状黄化',
        locationKey: 'leaf'
      },
      {
        symptomKey: 'sticky_honeydew',
        symptomCn: '叶子摸起来发黏',
        displayTextCn: '叶子摸起来发黏（蜜露）',
        locationKey: 'leaf'
      },
      {
        symptomKey: 'surface_glossy_residue',
        symptomCn: '叶子摸起来发黏',
        displayTextCn: '蜜露残留',
        locationKey: 'leaf'
      },
      {
        symptomKey: 'stem_mark',
        symptomCn: '茎部痕迹',
        displayTextCn: '茎部痕迹',
        locationKey: 'stem'
      },
      {
        symptomKey: 'powder_white',
        symptomCn: '白色粉层',
        displayTextCn: '白色粉层',
        locationKey: 'leaf'
      },
      {
        symptomKey: 'flower_mark',
        symptomCn: '花部痕迹',
        displayTextCn: '花部痕迹',
        locationKey: 'flower'
      },
      {
        symptomKey: 'small_flies_soil',
        symptomCn: '盆土小黑飞',
        displayTextCn: '盆土小黑飞',
        locationKey: 'soil'
      },
      {
        symptomKey: 'root_mark',
        symptomCn: '根部痕迹',
        displayTextCn: '根部痕迹',
        locationKey: 'root'
      },
      {
        symptomKey: 'plant_mark',
        symptomCn: '整株痕迹',
        displayTextCn: '整株痕迹',
        locationKey: 'plant'
      },
      {
        symptomKey: 'whole_mark',
        symptomCn: '整株全貌痕迹',
        displayTextCn: '整株全貌痕迹',
        locationKey: 'whole_plant'
      }
    ]
  }
}
const {
  buildSymptomLabelerPromptPayload
} = require('../../../../../cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js')

const prompt = buildCacheFirstVisualPrompt({
  taskLine: 'task',
  schemaText: '{"mode_candidates":[]}',
  ruleText: 'static rules',
  evidenceDirectoryText: 'static evidence',
  dynamicTaskText: 'plant image runtime payload'
})

assert.equal(DYNAMIC_TASK_MARKER, '[Dynamic Task]')
assert.equal(prompt.promptText.includes('[Dynamic Task]'), true)
assert.equal(prompt.staticPrefix.includes('plant image runtime payload'), false)
assert.equal(prompt.dynamicTail.includes('plant image runtime payload'), true)
assert.equal(prompt.staticPrefixHash.length, 40)
assert.equal(prompt.dynamicTailHash.length, 40)

const parsed = parseLLMVisualResult(
  JSON.stringify({
    normalized_organ: 'leaf',
    image_quality_grade: 'good',
    analyzability: 'high',
    symptom_candidates: [],
    route_hints: [],
    capture_region: 'leaf_lower_surface',
    mode_candidates: [{ mode: 'thrips', confidence: 0.72, region_ref: 'leaf_lower_surface' }],
    region_ref: 'leaf_lower_surface'
  })
)

assert.equal(parsed.capture_region, 'leaf_lower_surface')
assert.deepEqual(parsed.mode_candidates, [
  {
    mode: 'thrips',
    confidence: 0.72,
    region_ref: 'leaf_lower_surface'
  }
])
assert.equal(parsed.region_ref, 'leaf_lower_surface')

const pestProfileParsed = parseLLMVisualResult(
  JSON.stringify({
    normalized_organ: 'leaf',
    mode_candidates: [
      { mode: 'yellow_leaf', confidence: 0.9 },
      { mode: 'thrips', confidence: 0.72 }
    ]
  }),
  { diagnosisProfile: 'pest' }
)
assert.deepEqual(
  pestProfileParsed.mode_candidates.map(item => item.mode),
  ['thrips']
)

const promptSource = readFileSync(
  'cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js',
  'utf8'
)
const staticRulesSource = readFileSync(
  'cloudfunctions/diagnose-http/utils/visual-prompt-static-rules.js',
  'utf8'
)
// Measured from this fixed full/leaf fixture before the prompt compaction.
const fullLeafPromptLengthBaseline = 5441
const fullLeafStaticPrefixLengthBaseline = 4369
const currentStaticPrefixLengthBaseline = 2412
const maximumPromptLength = Math.floor(fullLeafPromptLengthBaseline * 0.67)
const maximumStaticPrefixLength = Math.floor(fullLeafStaticPrefixLengthBaseline * 0.65)
const configSource = readFileSync('cloudfunctions/diagnose-http/configs/index.js', 'utf8')
assert.doesNotMatch(configSource, /buildVisualLlmPrompt|VISUAL_PROMPT_LINES|prompts:\s*\{/)
assert.deepEqual(
  normalizeLlmImageTaskContext(
    { diagnosisProfile: 'pest', analysisRound: 'followup' },
    {
      diagnosisProfile: 'full',
      analysisRound: 'initial',
      requestedCaptureRegion: 'leaf_lower_surface',
      originVisualCallBatchId: 'visbatch_origin'
    }
  ),
  {
    diagnosisProfile: 'pest',
    analysisRound: 'followup',
    entrySource: '',
    plantContext: {},
    priorAdmittedEvidenceDigest: '',
    priorEvidenceLedger: [],
    unresolvedEvidenceGroups: [],
    requestedCaptureRegion: 'leaf_lower_surface',
    originVisualCallBatchId: 'visbatch_origin'
  }
)
const contextPrompt = await withLlmImagePromptContext(
  {
    diagnosisProfile: 'pest',
    analysisRound: 'followup',
    requestedCaptureRegion: 'leaf_lower_surface',
    originVisualCallBatchId: 'visbatch_origin'
  },
  () =>
    buildSymptomLabelerPromptPayload({
      imageContext: { inputSlotType: 'leaf' }
    })
)
assert.equal(contextPrompt.promptText.includes('"diagnosis_profile":"pest"'), true)
assert.equal(
  contextPrompt.promptText.includes('"requested_capture_region":"leaf_lower_surface"'),
  true
)
assert.match(promptSource, /taskLine: '【角色】你是植物图片的结构化可见证据标注助手。'/)
for (const field of [
  'diagnosis_profile',
  'analysis_round',
  'entry_source',
  'plant_context',
  'current_image_context',
  'prior_admitted_evidence_digest',
  'unresolved_evidence_groups',
  'requested_capture_region',
  'origin_visual_call_batch_id'
]) {
  assert.match(promptSource, new RegExp(field))
}
assert.doesNotMatch(promptSource, /promptTemplate/)
assert.match(promptSource, /visual-prompt-static-rules/)
assert.match(staticRulesSource, /【全局词典】/)
assert.match(staticRulesSource, /【工作流程】/)
assert.match(staticRulesSource, /compilePestVisualMapping/)
assert.match(promptSource, /allowed_symptom_keys/)
assert.doesNotMatch(promptSource, /buildCandidateCatalogText|buildGroupedSymptomOptionsText/)
assert.doesNotMatch(staticRulesSource, /buildCandidateCatalogText|buildGroupedSymptomOptionsText/)
assert.doesNotMatch(staticRulesSource, /mode_candidates object shape/)
assert.doesNotMatch(staticRulesSource, /Allowed mode_candidates keys/)
assert.doesNotMatch(staticRulesSource, /【虫害直判规则】/)
assert.doesNotMatch(staticRulesSource, /surface_glossy_residue=.*蜜露/)
assert.doesNotMatch(staticRulesSource, /surface_glossy_residue=.*黏/)
assert.ok(promptSource.split(/\r?\n/).length <= 500)
assert.ok(staticRulesSource.split(/\r?\n/).length <= 500)

const sqlSource = readFileSync('scripts/sql/add-specific-pest-diagnosis-mvp-20260720.sql', 'utf8')
const sqlPestKeys = Array.from(
  new Set([...sqlSource.matchAll(/\('([a-z0-9_]+)',/g)].map(match => match[1]).filter(Boolean))
)
assert.deepEqual(sqlPestKeys.sort(), [...FORMAL_PEST_VISUAL_EVIDENCE_KEYS].sort())
const legalLocationKeys = new Set([
  'leaf',
  'stem',
  'flower',
  'soil',
  'root',
  'plant',
  'whole_plant'
])
const sqlInsertLocationKeys = [...sqlSource.matchAll(/\('[a-z0-9_]+', '[^']+', '([^']+)',/g)]
  .map(match => match[1])
  .filter(Boolean)
assert.equal(sqlInsertLocationKeys.length, FORMAL_PEST_VISUAL_EVIDENCE_KEYS.length)
assert.deepEqual(
  sqlInsertLocationKeys.filter(key => !legalLocationKeys.has(key)),
  []
)
assert.match(sqlSource, /\('small_flies_soil', '[^']+', 'soil',/)
assert.match(sqlSource, /\('wet_soil_surface', '[^']+', 'soil',/)
assert.match(
  sqlSource,
  /UPDATE `symptoms`[\s\S]*`symptom_type` = 'visual'[\s\S]*`ai_visual_pool` = JSON_QUOTE\('yes'\)[\s\S]*WHERE `symptom_key` = 'leaf_droop';/
)
assert.doesNotMatch(sqlSource, /WHERE `symptom_key` = 'leaf_soft'/)
assert.match(sqlSource, /叶片或枝条表面可见发亮、近透明的滴状或薄膜状残留。/)
const surfaceSql = sqlSource.slice(
  sqlSource.indexOf("('surface_glossy_residue'"),
  sqlSource.indexOf("('sooty_mold'")
)
assert.doesNotMatch(surfaceSql, /蜜露|黏/)

const fullInitialPrompt = await buildSymptomLabelerPromptPayload({
  imageContext: { diagnosisProfile: 'full', analysisRound: 'initial', inputSlotType: 'leaf' }
})
const pestFollowupPrompt = await buildSymptomLabelerPromptPayload({
  imageContext: {
    diagnosisProfile: 'pest',
    analysisRound: 'followup',
    inputSlotType: 'leaf',
    requestedCaptureRegion: 'leaf_lower_surface',
    originVisualCallBatchId: 'visbatch_origin'
  }
})
const fullFollowupPrompt = await buildSymptomLabelerPromptPayload({
  imageContext: { diagnosisProfile: 'full', analysisRound: 'followup', inputSlotType: 'root' }
})
const pestInitialPrompt = await buildSymptomLabelerPromptPayload({
  imageContext: { diagnosisProfile: 'pest', analysisRound: 'initial', inputSlotType: 'other' }
})
const otherPrompt = await buildSymptomLabelerPromptPayload({
  imageContext: { diagnosisProfile: 'full', analysisRound: 'initial', inputSlotType: 'other' }
})
const rootPrompt = await buildSymptomLabelerPromptPayload({
  imageContext: { diagnosisProfile: 'full', analysisRound: 'initial', inputSlotType: 'root' }
})
assert.equal(
  pestFollowupPrompt.promptText.includes('"requested_capture_region":"leaf_lower_surface"'),
  true
)
assert.equal(
  pestFollowupPrompt.promptText.includes('"origin_visual_call_batch_id":"visbatch_origin"'),
  true
)
assert.equal(fullInitialPrompt.debugMeta.promptCacheStaticPrefixHash.length, 40)
const fullInitialStaticPrefix = fullInitialPrompt.promptText.split('[Dynamic Task]')[0]
const fullInitialDynamicTail = fullInitialPrompt.promptText.split('[Dynamic Task]')[1]
const fullInitialPromptLength = fullInitialPrompt.promptText.length
const fullInitialStaticPrefixLength = fullInitialStaticPrefix.trim().length
assert.equal(
  fullInitialPrompt.debugMeta.promptCacheStaticPrefixHash,
  createHash('sha1').update(fullInitialStaticPrefix.trim()).digest('hex')
)
assert.match(fullInitialStaticPrefix, /【角色】你是植物图片的结构化可见证据标注助手。/)
assert.match(fullInitialStaticPrefix, /\[静态输出契约\]/)
assert.match(fullInitialStaticPrefix, /\[静态规则\]/)
assert.match(fullInitialStaticPrefix, /\[静态全局词典\]/)
const staticSectionOffsets = ['【角色】', '[静态输出契约]', '【工作流程】', '[静态全局词典]'].map(
  section => fullInitialStaticPrefix.indexOf(section)
)
assert.equal(
  staticSectionOffsets.every(offset => offset >= 0),
  true
)
assert.deepEqual(
  staticSectionOffsets,
  [...staticSectionOffsets].sort((left, right) => left - right)
)
assert.match(fullInitialStaticPrefix, /surface_glossy_residue 仅在图片明确可见且位于允许器官时记录/)
for (const requiredPestEvidenceKey of [
  'visible_mite_colony',
  'visible_mealybug_colony',
  'scale_shells',
  'white_flies',
  'aphids_visible',
  'thrips_visible',
  'tunnels_in_leaf',
  'small_flies_soil'
]) {
  assert.match(fullInitialStaticPrefix, new RegExp(requiredPestEvidenceKey))
}
assert.doesNotMatch(fullInitialStaticPrefix, /细密网丝＋密集白黄点刺|覆粉蜡的椭圆分节虫群/)
assert.doesNotMatch(fullInitialStaticPrefix, /梨形或椭圆梨形软体虫群|固定附着的硬壳状凸起/)
assert.doesNotMatch(fullInitialStaticPrefix, /叶背白色成虫|当前图清楚可见细长、窄体/)
assert.doesNotMatch(
  fullInitialStaticPrefix,
  /叶肉内连续弯曲、宽度变化的潜道|盆土附近可见多只细小黑色飞虫/
)
assert.match(fullInitialStaticPrefix, /只依据图片独立判断当前图是否可见虫体或叶内潜道/)
assert.match(fullInitialStaticPrefix, /不清楚或不在图中=uncertain/)
assert.doesNotMatch(fullInitialStaticPrefix, /yellow_speckling=|surface_glossy_residue=/)
assert.doesNotMatch(
  fullInitialStaticPrefix,
  /网丝、点刺、黑点、残留|细长|窄体|银白擦伤|梨形|椭圆|硬壳|固定附着|小黑飞/
)
assert.doesNotMatch(
  fullInitialStaticPrefix,
  /细网|点状白黄伤痕|针尖黑点\/短线|表面可见发亮|黑色霉膜|盆土表面潮湿/
)
assert.doesNotMatch(
  fullInitialStaticPrefix,
  /Extract structured|Allowed mode_candidates|HARD REQUIREMENT/
)
assert.doesNotMatch(fullInitialStaticPrefix, /mode_candidates object shape|额外输出要求/)
assert.equal((fullInitialStaticPrefix.match(/"normalized_organ"/g) || []).length, 1)
assert.doesNotMatch(
  fullInitialPrompt.promptText,
  /sticky_honeydew|摸起来发黏|蜜露|stickiness|honeydew/
)
assert.equal(fullInitialPrompt.debugMeta.candidateSymptomKeysAll.includes('sticky_honeydew'), false)
assert.equal(
  fullInitialPrompt.debugMeta.candidateSymptomKeysAll.includes('surface_glossy_residue'),
  true
)
assert.doesNotMatch(
  JSON.stringify(fullInitialPrompt.debugMeta.candidateKeyDisplayPairsAll),
  /摸起来发黏|蜜露/
)
assert.match(fullInitialStaticPrefix, /"mode":"","confidence":0,"region_ref":"unknown"/)
const schemaFieldOffsets = [
  '"normalized_organ"',
  '"image_quality_grade"',
  '"analyzability"',
  '"capture_region"',
  '"region_ref"',
  '"mode_candidates"',
  '"symptom_candidates"',
  '"out_of_pool_symptom_candidates"',
  '"route_hints"'
].map(field => fullInitialStaticPrefix.indexOf(field))
assert.equal(
  schemaFieldOffsets.every(offset => offset >= 0),
  true
)
assert.deepEqual(
  schemaFieldOffsets,
  [...schemaFieldOffsets].sort((left, right) => left - right)
)
for (const objectShapeField of ['symptom_key', 'raw_visual_name_en', 'closest_symptom_key_hint']) {
  assert.match(fullInitialStaticPrefix, new RegExp(`"${objectShapeField}"`))
}
for (const excludedModelField of [
  'display_name_cn',
  'visibility_scope',
  'supporting_region_note',
  'admission_readiness',
  'raw_visual_name_cn',
  'reason_cn',
  'suggested_question_capture',
  'normalization_notes'
]) {
  assert.equal(Object.hasOwn(JSON.parse(VISUAL_OUTPUT_SCHEMA_TEXT), excludedModelField), false)
}
assert.equal(Object.hasOwn(JSON.parse(VISUAL_OUTPUT_SCHEMA_TEXT), 'visual_discriminators'), true)
assert.equal(Object.hasOwn(JSON.parse(VISUAL_OUTPUT_SCHEMA_TEXT), 'missing_info_for_path'), true)
assert.ok(
  fullInitialPromptLength <= maximumPromptLength,
  `full/leaf prompt ${fullInitialPromptLength} exceeds ${maximumPromptLength}`
)
assert.ok(
  fullInitialStaticPrefixLength <= maximumStaticPrefixLength,
  `full/leaf static prefix ${fullInitialStaticPrefixLength} exceeds ${maximumStaticPrefixLength}`
)
assert.ok(
  fullInitialStaticPrefixLength <= currentStaticPrefixLengthBaseline,
  `full/leaf static prefix ${fullInitialStaticPrefixLength} exceeds ${currentStaticPrefixLengthBaseline}`
)

const maximumCompactFixture = {
  normalized_organ: 'whole_plant',
  image_quality_grade: 'medium',
  analyzability: 'marginal',
  capture_region: 'whole_plant_overview',
  region_ref: 'whole_plant_overview',
  mode_candidates: [
    { mode: 'scale_insect', confidence: 0.999, region_ref: 'whole_plant_overview' }
  ],
  symptom_candidates: [
    'visible_mealybug_colony',
    'surface_glossy_residue',
    'fixed_oval_nymphs'
  ].map(symptomKey => ({
    symptom_key: symptomKey,
    strength_level: 'medium',
    confidence_band: 'medium'
  })),
  out_of_pool_symptom_candidates: [
    {
      raw_visual_name_en: 'unclassified_visible_foreign_body',
      closest_symptom_key_hint: 'visible_mealybug_colony'
    }
  ],
  route_hints: [{ type: 'possible_non_problematic_signal' }]
}
const maximumCompactJson = JSON.stringify(maximumCompactFixture)
assert.doesNotThrow(() => JSON.parse(maximumCompactJson))
assert.equal(Buffer.byteLength(maximumCompactJson) <= llm.cloudbaseAi.maxTokens, true)
const maximumCompactParsed = parseLLMVisualResult(maximumCompactJson, {
  diagnosisProfile: 'pest'
})
assert.equal(maximumCompactParsed.symptom_candidates.length, 3)
assert.equal(maximumCompactParsed.out_of_pool_symptom_candidates.length, 1)
assert.equal(maximumCompactParsed.mode_candidates.length, 1)
for (const comparedPrompt of [pestFollowupPrompt, fullFollowupPrompt, pestInitialPrompt]) {
  assert.equal(
    fullInitialPrompt.debugMeta.promptCacheStaticPrefixHash,
    comparedPrompt.debugMeta.promptCacheStaticPrefixHash
  )
}
if (process.env.PROMPT_CACHE_EVIDENCE === '1') {
  console.log(
    JSON.stringify({
      full_initial_static_hash: fullInitialPrompt.debugMeta.promptCacheStaticPrefixHash,
      pest_followup_static_hash: pestFollowupPrompt.debugMeta.promptCacheStaticPrefixHash,
      full_followup_static_hash: fullFollowupPrompt.debugMeta.promptCacheStaticPrefixHash,
      pest_initial_static_hash: pestInitialPrompt.debugMeta.promptCacheStaticPrefixHash,
      full_initial_dynamic_hash: fullInitialPrompt.debugMeta.promptCacheDynamicTailHash,
      pest_followup_dynamic_hash: pestFollowupPrompt.debugMeta.promptCacheDynamicTailHash,
      full_leaf_prompt_length: {
        before: fullLeafPromptLengthBaseline,
        after: fullInitialPromptLength,
        reduction_percent: Number(
          (
            ((fullLeafPromptLengthBaseline - fullInitialPromptLength) /
              fullLeafPromptLengthBaseline) *
            100
          ).toFixed(2)
        )
      },
      full_leaf_static_prefix_length: {
        before: fullLeafStaticPrefixLengthBaseline,
        after: fullInitialStaticPrefixLength,
        after_bytes: Buffer.byteLength(fullInitialStaticPrefix),
        reduction_percent: Number(
          (
            ((fullLeafStaticPrefixLengthBaseline - fullInitialStaticPrefixLength) /
              fullLeafStaticPrefixLengthBaseline) *
            100
          ).toFixed(2)
        )
      }
    })
  )
}
assert.deepEqual(otherPrompt.debugMeta.locationKeys, [
  'leaf',
  'stem',
  'flower',
  'soil',
  'root',
  'plant',
  'whole_plant'
])
assert.equal(otherPrompt.promptText.includes('allowed_location_keys=none'), false)
assert.match(
  otherPrompt.promptText,
  /allowed_location_keys=leaf,stem,flower,soil,root,plant,whole_plant/
)
assert.deepEqual(rootPrompt.debugMeta.locationKeys, ['root', 'soil'])
assert.match(rootPrompt.promptText, /allowed_location_keys=root,soil/)
assert.match(
  pestFollowupPrompt.promptText,
  /allowed_symptom_keys=visible_mite_colony,fine_webbing,yellow_speckling,visible_mealybug_colony,scale_shells,white_flies,fixed_oval_nymphs,aphids_visible,thrips_visible,silver_scarring,black_fecal_spots,tunnels_in_leaf,surface_glossy_residue,sooty_mold/
)
assert.match(rootPrompt.promptText, /allowed_symptom_keys=small_flies_soil,root_mark/)
assert.doesNotMatch(
  fullInitialPrompt.promptText.split('[Dynamic Task]')[0],
  /allowed_symptom_keys=|本图收窄候选/
)
assert.match(fullInitialDynamicTail, /【虫害映射】organ=leaf/)
assert.match(fullInitialDynamicTail, /【当前图可见异常说明】/)
assert.match(
  fullInitialDynamicTail,
  /识别明确后，若有虫体实体必须优先报告对应 mode_candidates 与正式 evidence key，不能只报同图异常而遗漏实体/
)
assert.doesNotMatch(fullInitialDynamicTail, /本图收窄候选|【叶片】/)
assert.match(
  fullInitialDynamicTail,
  /spider_mite→visible_mite_colony OR fine_webbing\+yellow_speckling/
)
assert.match(fullInitialDynamicTail, /aphid→aphids_visible(?:;|$)/)
assert.match(fullInitialDynamicTail, /whitefly→white_flies\+fixed_oval_nymphs(?:;|$)/)
assert.match(
  fullInitialDynamicTail,
  /thrips→thrips_visible OR silver_scarring\+black_fecal_spots(?:;|$)/
)
for (const visibleAnomalyText of [
  'fine_webbing=叶片或茎部可见细网',
  'yellow_speckling=叶片点状白黄伤痕',
  'silver_scarring=同区银白擦伤',
  'black_fecal_spots=同区针尖黑点/短线',
  'tunnels_in_leaf=叶内潜道',
  'surface_glossy_residue=叶片或茎部表面可见发亮、近透明滴状或薄膜残留',
  'sooty_mold=叶片或茎部可见黑色霉膜'
]) {
  assert.match(
    fullInitialDynamicTail,
    new RegExp(visibleAnomalyText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  )
}
assert.doesNotMatch(
  fullInitialDynamicTail,
  /细长|窄体|梨形|椭圆|硬壳|固定附着|覆粉蜡|白色成虫|小黑飞|螨体/
)
assert.doesNotMatch(fullInitialDynamicTail, /aphid→[^;]*surface_glossy_residue/)
assert.doesNotMatch(fullInitialDynamicTail, /thrips→[^;]*yellow_speckling/)
assert.notEqual(
  fullInitialPrompt.debugMeta.promptCacheDynamicTailHash,
  pestFollowupPrompt.debugMeta.promptCacheDynamicTailHash
)
assert.equal(
  fullInitialPrompt.promptText.split('[Dynamic Task]')[0].includes('diagnosis_profile'),
  false
)
const pestDynamicTail = pestFollowupPrompt.promptText.split('[Dynamic Task]')[1]
assert.match(pestDynamicTail, /diagnosis_profile=pest/)
assert.doesNotMatch(pestDynamicTail, /black_spots_spreading/)
assert.match(pestDynamicTail, /black_fecal_spots/)
assert.match(pestDynamicTail, /mode_candidates 只能使用这 8 个虫害机器键/)
assert.match(pestDynamicTail, /不能输出 yellow_leaf 或 wilting_droop 作为 mode_candidates/)
assert.match(pestDynamicTail, /识别明确后，虫害 mode_candidates\[\]\.mode 只能填模式键/)
assert.match(
  pestDynamicTail,
  /先基于当前图片独立识别可见虫体或叶内潜道；识别明确后，若有虫体实体必须优先报告对应 mode_candidates 与正式 evidence key，不能只报同图异常而遗漏实体；不得从 mode key、evidence key、器官名或文字反推画面/
)
assert.match(pestDynamicTail, /silver_scarring=同区银白擦伤/)
assert.match(pestDynamicTail, /black_fecal_spots=同区针尖黑点\/短线/)
assert.doesNotMatch(pestDynamicTail, /清楚细长虫体|梨形软体虫|固定附着|覆粉蜡|白色成虫|盆土小黑飞/)
assert.doesNotMatch(fullInitialDynamicTail, /蓟马映射|mode_candidates\[\]\.mode=thrips/)
assert.doesNotMatch(
  pestFollowupPrompt.promptText.split('[Dynamic Task]')[0],
  /mode_candidates 只能使用这 8 个虫害机器键/
)

const legalOrganKeys = new Set(['leaf', 'stem', 'flower', 'soil'])
const bodyEvidenceKeys = new Set([
  'visible_mite_colony',
  'visible_mealybug_colony',
  'scale_shells',
  'white_flies',
  'fixed_oval_nymphs',
  'aphids_visible',
  'thrips_visible',
  'small_flies_soil'
])
assert.deepEqual(PEST_EVIDENCE_RULES.spider_mite.candidateGroups, [
  ['visible_mite_colony'],
  ['fine_webbing']
])
assert.equal(PEST_VISUAL_RULES.length, PEST_MODE_KEYS.length)
for (const rule of PEST_VISUAL_RULES) {
  assert.equal(PEST_MODE_KEYS.includes(rule.modeKey), true)
  assert.ok(rule.organKeys.length > 0)
  assert.equal(
    rule.organKeys.every(organKey => legalOrganKeys.has(organKey)),
    true
  )
  for (const field of ['visualSummary', 'visualDescription', 'exclusion']) {
    assert.equal(Object.hasOwn(rule, field), false)
  }
  assert.ok(rule.evidence.length > 0)
  for (const item of rule.evidence) {
    assert.equal(FORMAL_PEST_VISUAL_EVIDENCE_KEYS.includes(item.evidenceKey), true)
    assert.equal(Object.hasOwn(item, 'visualDescription'), false)
  }
  assert.equal(
    rule.visibleAnomalies.every(
      item =>
        FORMAL_PEST_VISUAL_EVIDENCE_KEYS.includes(item.evidenceKey) &&
        !bodyEvidenceKeys.has(item.evidenceKey) &&
        typeof item.description === 'string' &&
        Boolean(item.description)
    ),
    true
  )
  const compiled = compilePestVisualMapping(rule.organKeys)
  const modeMapping = compiled
    .slice(compiled.indexOf(':') + 1)
    .split(';')
    .find(item => item.startsWith(`${rule.modeKey}→`))
  const directRule = PEST_EVIDENCE_RULES[rule.modeKey]
  assert.ok(modeMapping)
  for (const group of directRule.directGroups) {
    for (const evidenceKey of group) {
      const canonicalKey =
        { silver_streaks: 'silver_scarring', stippling: 'yellow_speckling' }[evidenceKey] ||
        evidenceKey
      assert.match(modeMapping, new RegExp(canonicalKey))
    }
  }
  for (const combination of directRule.directCombinationGroups) {
    for (const group of combination) {
      for (const evidenceKey of group) {
        const canonicalKey =
          { silver_streaks: 'silver_scarring', stippling: 'yellow_speckling' }[evidenceKey] ||
          evidenceKey
        assert.match(modeMapping, new RegExp(canonicalKey))
      }
    }
  }
  for (const item of rule.evidence) {
    const isDirect = [
      ...(directRule.directGroups || []).flat(),
      ...(directRule.directCombinationGroups || []).flat(2)
    ].some(evidenceKey => {
      const canonicalKey =
        { silver_streaks: 'silver_scarring', stippling: 'yellow_speckling' }[evidenceKey] ||
        evidenceKey
      return canonicalKey === item.evidenceKey
    })
    if (!isDirect) {
      assert.doesNotMatch(modeMapping, new RegExp(item.evidenceKey))
    }
  }
}
const leafMapping = compilePestVisualMapping(['leaf'])
for (const modeKey of [
  'spider_mite',
  'mealybug',
  'scale_insect',
  'whitefly',
  'aphid',
  'thrips',
  'leaf_miner'
]) {
  assert.match(leafMapping, new RegExp(`${modeKey}→`))
}
const soilMapping = compilePestVisualMapping(['soil'])
assert.match(soilMapping, /fungus_gnat→/)
assert.match(soilMapping, /fungus_gnat→small_flies_soil(?:$|;)/)
assert.doesNotMatch(soilMapping, /fungus_gnat→[^;]*wet_soil_surface/)
assert.doesNotMatch(soilMapping, /spider_mite→|leaf_miner→/)
assert.doesNotMatch(leafMapping, /细网|点状白黄伤痕|银白擦伤|针尖黑点|叶内潜道|表面可见|黑色霉膜/)
const rootDynamicTail = rootPrompt.promptText.split('[Dynamic Task]').at(1)
assert.match(rootDynamicTail, /wet_soil_surface=盆土表面潮湿/)
assert.doesNotMatch(
  rootDynamicTail,
  /fine_webbing=|yellow_speckling=|silver_scarring=|black_fecal_spots=|tunnels_in_leaf=/
)

if (originalSymptomRepository) {
  require.cache[symptomRepositoryPath] = originalSymptomRepository
} else {
  delete require.cache[symptomRepositoryPath]
}
