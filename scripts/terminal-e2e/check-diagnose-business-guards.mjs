import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveLocalLayerPath(request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('/opt/utils/')) {
    const localLayerModule = path.join(
      projectRoot,
      'cloudfunctions/layer/utils',
      `${request.slice('/opt/utils/'.length)}.js`
    )
    return originalResolveFilename.call(this, localLayerModule, parent, isMain, options)
  }
  if (request === '/opt/configs') {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/configs/index.js'),
      parent,
      isMain,
      options
    )
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const {
  filterPromptSymptomsByLocation
} = require('../../cloudfunctions/diagnose-http/utils/prompt-symptom-pool')
const {
  HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES,
  getHighSpecificityQuestionBlockedSymptomKeys
} = require('../../cloudfunctions/diagnose-http/constants/high-specificity-fast-convergence')
const {
  resolveHighSpecificityConvergencePlan
} = require('../../cloudfunctions/diagnose-http/domain/high-specificity-fast-convergence')
const {
  selectFollowUpQuestions
} = require('../../cloudfunctions/diagnose-http/domain/question-selector')
const {
  canOpenNextFollowUpRound,
  shouldUseVisualCandidateSeedQuestion,
  buildSyntheticVisualCandidateQuestion,
  shouldSuppressCrossDirectionVisualCandidate,
  shouldAllowForcedContextProblemFollowUp,
  shouldRestrictToCandidateSeedOnly,
  shouldForceMoldDirectionFirstRoundFollowUp,
  shouldForceVisualCandidateOrthogonalFollowUp,
  _test: diagnosisEngineTestHooks
} = require('../../cloudfunctions/diagnose-http/domain/diagnosis-engine')
const {
  computeVisualEvidenceScores,
  computeQuestionEvidenceAndPenalty
} = require('../../cloudfunctions/diagnose-http/domain/evidence-scoring')
const {
  resolveLowConfidenceState
} = require('../../cloudfunctions/diagnose-http/domain/uncertain-gate')
const {
  formatDiagnosisResponse
} = require('../../cloudfunctions/diagnose-http/domain/result-formatter')
const {
  evaluateStopState
} = require('../../cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator')
const {
  evaluateOutputEligibility
} = require('../../cloudfunctions/diagnose-http/domain/stop-state/output-eligibility-evaluator')
const {
  planQuestionQueue
} = require('../../cloudfunctions/diagnose-http/domain/question-queue/question-queue-planner')
const {
  buildSyntheticObservedProbeQuestions,
  buildSyntheticFollowUpOptionMappings,
  buildSyntheticVisualCandidateQuestionKey
} = require('../../cloudfunctions/diagnose-http/utils/synthetic-follow-up')
const {
  QUESTION_TARGET_DIMENSIONS
} = require('../../cloudfunctions/diagnose-http/utils/question-target-dimension')
const {
  buildDerivedEvidenceSet
} = require('../../cloudfunctions/diagnose-http/utils/derived-evidence')
const {
  buildDiagnosisDirections
} = require('../../cloudfunctions/diagnose-http/utils/diagnosis-directions')
const {
  resolveNonProblematicRule
} = require('../../cloudfunctions/diagnose-http/domain/non-problematic-resolver')
const {
  buildExplicitObservedSymptomKeySet
} = require('../../cloudfunctions/diagnose-http/utils/explicit-observed-symptom')
const {
  evaluateContextRequiredProblemGuard
} = require('../../cloudfunctions/diagnose-http/utils/context-required-problem-guard')
const {
  getOutputEligibleProblemRankings
} = require('../../cloudfunctions/diagnose-http/utils/output-eligibility')
const {
  prompts: { llm: buildPromptTemplate }
} = require('../../cloudfunctions/diagnose-http/configs')

function checkPromptLocationPoolGuard() {
  const symptomRows = [
    { symptomKey: 'leaf_only', locationKey: 'leaf', displayTextCn: '叶片症状' },
    { symptomKey: 'stem_only', locationKey: 'stem', displayTextCn: '茎部症状' },
    { symptomKey: 'soil_only', locationKey: 'soil', displayTextCn: '土壤症状' }
  ]

  const filtered = filterPromptSymptomsByLocation(symptomRows, ['leaf'])
  assert.deepEqual(
    filtered.map(item => item.symptomKey),
    ['leaf_only'],
    'leaf 槽位必须只向 prompt 暴露 leaf location_key 池'
  )

  return {
    name: 'prompt_location_pool_guard',
    ok: true
  }
}

function checkPromptCommonSenseGuard() {
  const prompt = buildPromptTemplate({
    symptomOptionsText: 'chewed_edges（叶子边缘像被啃过）、black_spots_spreading（黑斑扩散）',
    imageContextText: '当前图：第1/1张；槽位=叶片。'
  })

  assert.ok(
    prompt.includes('Prefer structural damage for true holes') &&
      prompt.includes('Use only visible evidence') &&
      prompt.includes('infer no cause'),
    'prompt 必须把孔洞/缺口/骨架化约束为结构损伤视觉事实，且不得直接推断虫害病因'
  )
  assert.ok(
    prompt.includes('Report yellow_speckling only for dense') &&
      prompt.includes('clustered') &&
      prompt.includes('do not guess'),
    'prompt 必须显式约束弱小黄点信号要保守，不能把反光/高光硬报为 yellow_speckling'
  )
  assert.ok(
    prompt.includes('powdery, gray-black, or removable films') &&
      prompt.includes('surface-coverage/mold patterns') &&
      prompt.includes('not internal spots'),
    'prompt 必须显式约束表面白粉/煤污层优先走覆盖层/霉层，而不是组织内部斑点'
  )

  return {
    name: 'prompt_common_sense_guard',
    ok: true
  }
}

function checkObservedMorphologyPriorityGuard() {
  const candidateOnlySelected = selectFollowUpQuestions({
    rankings: [
      { problemKey: 'fungal_leaf_spot', finalScore: 0.91, baseScore: 0.91 },
      { problemKey: 'black_spot', finalScore: 0.83, baseScore: 0.83 }
    ],
    strategies: [
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_black_spots_spreading_confirm',
        priorityScore: 90,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_brown_spots_halo_confirm',
        priorityScore: 92,
        reviewStatus: 'audited'
      }
    ],
    questions: [
      {
        questionKey: 'q_black_spots_spreading_confirm',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'visual_presence',
        questionTextUserCn: '是否有逐渐扩大的黑斑或暗色斑块？',
        questionGroupKey: 'leaf_spot_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_brown_spots_halo_confirm',
        targetSymptomKey: 'brown_spots_halo',
        targetDimension: 'visual_presence',
        questionTextUserCn: '叶片有褐色病斑，并在周围伴随黄色晕圈吗？',
        questionGroupKey: 'leaf_spot_group',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [],
    observedSymptoms: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.71,
        signalReliability: 0.66,
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    observedEvidenceSet: [],
    symptomDictionary: [
      {
        symptomKey: 'black_spots_spreading',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      },
      {
        symptomKey: 'brown_spots_halo',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    maxQuestions: 3
  })

  assert.equal(
    candidateOnlySelected[0]?.questionKey,
    'q_black_spots_spreading_confirm',
    '视觉事实尚未正式锁定时，必须优先问直接观察到的 symptom confirm 题'
  )
  assert.ok(
    !candidateOnlySelected.some(item => item.questionKey === 'q_brown_spots_halo_confirm'),
    '尚未锁定时也不允许同部位同形态 sibling 题抢占直接观察题'
  )

  const selected = selectFollowUpQuestions({
    rankings: [
      { problemKey: 'fungal_leaf_spot', finalScore: 0.91, baseScore: 0.91 },
      { problemKey: 'black_spot', finalScore: 0.83, baseScore: 0.83 },
      { problemKey: 'bacterial_leaf_spot', finalScore: 0.81, baseScore: 0.81 },
      { problemKey: 'sooty_mold_associated_pests', finalScore: 0.52, baseScore: 0.52 }
    ],
    strategies: [
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_black_spots_spreading_confirm',
        priorityScore: 90,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_brown_spots_halo_confirm',
        priorityScore: 92,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'bacterial_leaf_spot',
        questionKey: 'q_bacterial_water_soaked',
        priorityScore: 94,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_black_spots_surface_layer_check',
        priorityScore: 88,
        reviewStatus: 'audited'
      }
    ],
    questions: [
      {
        questionKey: 'q_black_spots_spreading_confirm',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'visual_presence',
        questionTextUserCn: '是否有逐渐扩大的黑斑或暗色斑块？',
        questionGroupKey: 'leaf_spot_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_brown_spots_halo_confirm',
        targetSymptomKey: 'brown_spots_halo',
        targetDimension: 'visual_presence',
        questionTextUserCn: '叶片有褐色病斑，并在周围伴随黄色晕圈吗？',
        questionGroupKey: 'leaf_spot_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_bacterial_water_soaked',
        targetSymptomKey: 'water_soaked_spots',
        targetDimension: 'lesion_water_soaking',
        questionTextUserCn: '病斑附近组织是否发软、带水渍感？',
        questionGroupKey: 'leaf_spot_texture_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_black_spots_surface_layer_check',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'surface_residue',
        questionTextUserCn: '这些黑斑更像浮在表面、轻擦会蹭开吗？',
        questionGroupKey: 'leaf_surface_residue_group',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [],
    observedSymptoms: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.81,
        signalReliability: 0.88,
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.93,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'black_spots_spreading',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      },
      {
        symptomKey: 'brown_spots_halo',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      },
      {
        symptomKey: 'water_soaked_spots',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      },
      {
        symptomKey: 'sooty_mold',
        locationKey: 'leaf',
        patternKey: 'mold',
        distributionKey: 'random'
      }
    ],
    maxQuestions: 3
  })

  assert.ok(
    !selected.some(item => item.questionKey === 'q_black_spots_spreading_confirm'),
    '已 high-confidence formally_admitted 的视觉事实，不应再进入同 symptom 的 visual_presence confirm 题'
  )
  assert.ok(
    !selected.some(item => item.questionKey === 'q_brown_spots_halo_confirm'),
    '已锁定黑斑类视觉事实后，不应再进入同部位同形态的 sibling visual_presence 题'
  )
  assert.equal(
    selected.length,
    1,
    '单题契约下每轮只能返回一个活跃 follow-up'
  )
  assert.ok(
    ['q_bacterial_water_soaked', 'q_black_spots_surface_layer_check'].includes(selected[0]?.questionKey),
    '高置信视觉事实锁定后，应只返回一个非 visual_presence 的差异维度问题'
  )

  const candidateLockedSelected = selectFollowUpQuestions({
    rankings: [
      { problemKey: 'fungal_leaf_spot', finalScore: 0.91, baseScore: 0.91 },
      { problemKey: 'black_spot', finalScore: 0.83, baseScore: 0.83 },
      { problemKey: 'bacterial_leaf_spot', finalScore: 0.81, baseScore: 0.81 },
      { problemKey: 'sooty_mold_associated_pests', finalScore: 0.52, baseScore: 0.52 }
    ],
    strategies: [
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_black_spots_spreading_confirm',
        priorityScore: 90,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_brown_spots_halo_confirm',
        priorityScore: 92,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'bacterial_leaf_spot',
        questionKey: 'q_bacterial_water_soaked',
        priorityScore: 94,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_black_spots_surface_layer_check',
        priorityScore: 88,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_black_spots_tissue_moisture_check',
        priorityScore: 89,
        reviewStatus: 'audited'
      }
    ],
    questions: [
      {
        questionKey: 'q_black_spots_spreading_confirm',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'visual_presence',
        questionTextUserCn: '是否有逐渐扩大的黑斑或暗色斑块？',
        questionGroupKey: 'leaf_spot_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_brown_spots_halo_confirm',
        targetSymptomKey: 'brown_spots_halo',
        targetDimension: 'visual_presence',
        questionTextUserCn: '叶片有褐色病斑，并在周围伴随黄色晕圈吗？',
        questionGroupKey: 'leaf_spot_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_bacterial_water_soaked',
        targetSymptomKey: 'water_soaked_spots',
        targetDimension: 'tissue_moisture',
        questionTextUserCn: '病斑附近组织是否发软、带水渍感？',
        questionGroupKey: 'leaf_spot_texture_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_black_spots_surface_layer_check',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'surface_residue',
        questionTextUserCn: '这些黑斑更像浮在表面、轻擦会蹭开吗？',
        questionGroupKey: 'leaf_surface_residue_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_black_spots_tissue_moisture_check',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'tissue_moisture',
        questionTextUserCn: '斑点附近组织更像干硬坏死，还是发软、带水渍感？',
        questionGroupKey: 'leaf_spot_texture_group',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [],
    observedSymptoms: [],
    observedEvidenceSet: [],
    visualCandidateSymptoms: [
      {
        symptomKey: 'black_spots_spreading',
        symptomCn: '黑斑扩散',
        confidenceBand: 'high',
        strengthLevel: 'strong',
        admissionReadiness: 'cautious',
        signalReliability: 0.88,
        supportCount: 1,
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'black_spots_spreading',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      },
      {
        symptomKey: 'brown_spots_halo',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      },
      {
        symptomKey: 'water_soaked_spots',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    maxQuestions: 3
  })

  assert.ok(
    !candidateLockedSelected.some(item => item.questionKey === 'q_black_spots_spreading_confirm'),
    '高强度 visual candidate 阶段不得再问同义 visual_presence confirm'
  )
  assert.ok(
    !candidateLockedSelected.some(item => item.questionKey === 'q_brown_spots_halo_confirm'),
    '高强度 visual candidate 阶段也不允许 sibling visual_presence 题抢占当前候选 symptom 的正式 confirm'
  )
  assert.equal(
    candidateLockedSelected.length,
    1,
    '高强度 visual candidate 阶段也必须遵守单题契约'
  )
  assert.ok(
    ['q_black_spots_surface_layer_check', 'q_black_spots_tissue_moisture_check'].includes(
      candidateLockedSelected[0]?.questionKey
    ),
    '高强度 visual candidate 阶段应转向表面附着或组织湿软等差异维度问题'
  )

  const returnBlockedSelected = selectFollowUpQuestions({
    rankings: [
      { problemKey: 'fungal_leaf_spot', finalScore: 0.91, baseScore: 0.91 },
      { problemKey: 'bacterial_leaf_spot', finalScore: 0.81, baseScore: 0.81 }
    ],
    strategies: [
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_black_spots_spreading_confirm',
        priorityScore: 90,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'bacterial_leaf_spot',
        questionKey: 'q_bacterial_water_soaked',
        priorityScore: 94,
        reviewStatus: 'audited'
      }
    ],
    questions: [
      {
        questionKey: 'q_black_spots_spreading_confirm',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'visual_presence',
        questionTextUserCn: '是否有逐渐扩大的黑斑或暗色斑块？',
        questionGroupKey: 'leaf_spot_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_bacterial_water_soaked',
        targetSymptomKey: 'water_soaked_spots',
        targetDimension: 'tissue_moisture',
        questionTextUserCn: '病斑附近组织是否发软、带水渍感？',
        questionGroupKey: 'leaf_spot_texture_group',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [],
    observedSymptoms: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.93,
        signalReliability: 0.88,
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.93,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ],
    askedQuestionKeys: ['q_black_spots_surface_layer_check'],
    askedQuestions: [
      {
        questionKey: 'q_black_spots_surface_layer_check',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'surface_residue',
        questionGroupKey: 'leaf_surface_residue_group',
        reviewStatus: 'audited'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'black_spots_spreading',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      },
      {
        symptomKey: 'water_soaked_spots',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    maxQuestions: 3
  })

  assert.ok(
    !returnBlockedSelected.some(item => item.questionKey === 'q_black_spots_spreading_confirm'),
    '已做过同 target 的正交 probing 后，不应在后续轮次回退到 visual_presence confirm'
  )
  assert.ok(
    returnBlockedSelected.some(item => item.questionKey === 'q_bacterial_water_soaked'),
    '后续轮次应继续保留正交维度 probing，而不是回退到同维度确认'
  )

  const sameTargetDimensionBlockedSelected = selectFollowUpQuestions({
    rankings: [
      { problemKey: 'fungal_leaf_spot', finalScore: 0.91, baseScore: 0.91 }
    ],
    strategies: [
      {
        problemKey: 'fungal_leaf_spot',
        questionKey: 'q_black_spots_surface_layer_recheck',
        priorityScore: 95,
        reviewStatus: 'audited'
      }
    ],
    questions: [
      {
        questionKey: 'q_black_spots_surface_layer_recheck',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'surface_residue',
        questionTextUserCn: '这些斑点更像浮在表面，能轻擦掉吗？',
        questionGroupKey: 'leaf_surface_residue_group_v2',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [],
    observedSymptoms: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.93,
        signalReliability: 0.88,
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.93,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ],
    askedQuestionKeys: ['q_black_spots_surface_layer_check'],
    askedQuestions: [
      {
        questionKey: 'q_black_spots_surface_layer_check',
        targetSymptomKey: 'black_spots_spreading',
        targetDimension: 'surface_residue',
        questionGroupKey: 'leaf_surface_residue_group',
        reviewStatus: 'audited'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'black_spots_spreading',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      }
    ],
    maxQuestions: 3
  })

  assert.equal(
    sameTargetDimensionBlockedSelected.length,
    0,
    '同一 targetSymptomKey + targetDimension 已问过后，不允许跨 questionGroupKey 再次进入队列'
  )

  const sameDimensionSelected = selectFollowUpQuestions({
    rankings: [
      { problemKey: 'sooty_mold_associated_pests', finalScore: 0.78, baseScore: 0.78 }
    ],
    strategies: [
      {
        problemKey: 'sooty_mold_associated_pests',
        questionKey: 'q_sooty_mold_confirm',
        priorityScore: 96,
        reviewStatus: 'audited'
      }
    ],
    questions: [
      {
        questionKey: 'q_sooty_mold_confirm',
        targetSymptomKey: 'sooty_mold',
        targetDimension: 'surface_residue',
        questionTextUserCn: '叶片表面有黑灰色、像煤污一样的覆盖层吗？',
        questionGroupKey: 'honeydew_pests_group',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [],
    observedSymptoms: [
      {
        symptomKey: 'sooty_mold',
        confidence: 0.93,
        signalReliability: 0.9,
        locationKey: 'leaf',
        patternKey: 'mold',
        distributionKey: 'random'
      }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'sooty_mold',
        confidence: 0.93,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'sooty_mold',
        locationKey: 'leaf',
        patternKey: 'mold',
        distributionKey: 'random'
      }
    ],
    maxQuestions: 3
  })

  assert.equal(
    sameDimensionSelected.length,
    0,
    '视觉已明确给出“表面黑灰附着层”时，不允许再追问同一 surface_residue 维度的 sooty_mold 确认题'
  )

  return {
    name: 'observed_morphology_priority_guard',
    ok: true,
    selectedQuestionKeys: selected.map(item => item.questionKey),
    candidateLockedQuestionKeys: candidateLockedSelected.map(item => item.questionKey),
    returnBlockedQuestionKeys: returnBlockedSelected.map(item => item.questionKey)
  }
}

function checkExplicitObservedVisualPresenceBlockGuard() {
  const selected = selectFollowUpQuestions({
    rankings: [
      { problemKey: 'chlorosis', finalScore: 0.78, baseScore: 0.78 },
      { problemKey: 'iron_deficiency', finalScore: 0.72, baseScore: 0.72 }
    ],
    strategies: [
      {
        problemKey: 'chlorosis',
        questionKey: 'q_leaf_yellowing_confirm',
        priorityScore: 95,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'chlorosis',
        questionKey: 'q_observed_probe__leaf_yellowing__host_confirmation',
        priorityScore: 90,
        reviewStatus: 'synthetic'
      }
    ],
    questions: [
      {
        questionKey: 'q_leaf_yellowing_confirm',
        targetSymptomKey: 'leaf_yellowing',
        targetDimension: 'visual_presence',
        routingScope: 'symptom_confirmation',
        questionTextUserCn: '植株有比较明确的发黄叶片，而不是轻微失绿或反光吗？',
        questionGroupKey: 'leaf_yellowing_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__host_confirmation',
        targetSymptomKey: 'leaf_yellowing',
        targetDimension: 'host_confirmation',
        routingScope: 'context_probe',
        questionTextUserCn: '这种叶黄是否主要集中在老叶？',
        questionGroupKey: 'observed_probe__leaf_yellowing__host_confirmation',
        reviewStatus: 'synthetic'
      }
    ],
    optionMappings: [],
    observedSymptoms: [
      {
        symptomKey: 'leaf_yellowing',
        confidence: 0.92,
        signalReliability: 0.7,
        locationKey: 'leaf',
        patternKey: '',
        distributionKey: 'random'
      }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        confidence: 0.92,
        sourceType: 'legacy_observed_symptom',
        currentStatus: 'active'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'leaf_yellowing',
        locationKey: 'leaf',
        patternKey: '',
        distributionKey: 'random'
      }
    ],
    maxQuestions: 2
  })

  assert.ok(
    !selected.some(item => item.questionKey === 'q_leaf_yellowing_confirm'),
    '首轮显式传入的 legacy_observed_symptom 不允许再回到同 symptom 的 visual_presence confirm'
  )

  return {
    name: 'explicit_observed_visual_presence_block_guard',
    ok: true
  }
}

function checkSyntheticObservedProbeGuard() {
  const leafQuestions = buildSyntheticObservedProbeQuestions(
    {
      symptomKey: 'leaf_margin_burn',
      symptomCn: '叶缘灼伤',
      locationKey: 'leaf',
      patternKey: 'burn',
      distributionKey: 'edges'
    },
    { maxQuestions: 2 }
  )

  assert.equal(leafQuestions.length, 1, '单题契约下叶部灼伤类 symptom 每轮只生成 1 条正交 probe 题')
  assert.deepEqual(
    leafQuestions.map(item => item.targetDimension),
    ['distribution_scope'],
    '叶缘灼伤应先转向分布范围维度，而不是回到 visual_presence'
  )
  assert.ok(
    leafQuestions.every(item => item.targetDimension !== 'visual_presence'),
    'synthetic observed probe 不允许生成 visual_presence 维度题'
  )

  const stemQuestions = buildSyntheticObservedProbeQuestions(
    {
      symptomKey: 'water_soaked_stem',
      symptomCn: '水浸状茎',
      locationKey: 'stem',
      patternKey: 'soaked',
      distributionKey: 'base'
    },
    { maxQuestions: 2 }
  )

  assert.deepEqual(
    stemQuestions.map(item => item.targetDimension),
    ['tissue_moisture'],
    '单题契约下茎部水浸类 symptom 应先转向组织湿软维度'
  )

  const yellowingQuestions = buildSyntheticObservedProbeQuestions(
    {
      symptomKey: 'leaf_yellowing',
      symptomCn: '叶子明显发黄',
      locationKey: 'leaf',
      patternKey: '',
      distributionKey: 'random'
    },
    { maxQuestions: 3 }
  )

  assert.deepEqual(
    yellowingQuestions.map(item => item.targetDimension),
    ['yellowing_leaf_age_pattern'],
    '单题契约下叶片黄化类 symptom 应先转向明确叶龄分流维度，而不是停留在通用进展题'
  )

  return {
    name: 'synthetic_observed_probe_guard',
    ok: true
  }
}

function checkObservedContextDimensionDiversityGuard() {
  const selected = selectFollowUpQuestions({
    rankings: [
      { problemKey: 'iron_deficiency', finalScore: 0.72, baseScore: 0.72 },
      { problemKey: 'nitrogen_deficiency', finalScore: 0.7, baseScore: 0.7 },
      { problemKey: 'underwatering', finalScore: 0.66, baseScore: 0.66 },
      { problemKey: 'low_light', finalScore: 0.64, baseScore: 0.64 }
    ],
    strategies: [
      { problemKey: 'iron_deficiency', questionKey: 'q_iron_new_leaves_yellow', priorityScore: 100, reviewStatus: 'audited' },
      { problemKey: 'nitrogen_deficiency', questionKey: 'q_nitrogen_old_leaves_yellow', priorityScore: 100, reviewStatus: 'audited' },
      { problemKey: 'underwatering', questionKey: 'q_leaf_yellowing_watering_background', priorityScore: 96, reviewStatus: 'audited' },
      { problemKey: 'low_light', questionKey: 'q_leaf_yellowing_light_background', priorityScore: 96, reviewStatus: 'audited' },
      { problemKey: 'nitrogen_deficiency', questionKey: 'q_leaf_yellowing_fertilization_background', priorityScore: 94, reviewStatus: 'audited' }
    ],
    questions: [
      {
        questionKey: 'q_iron_new_leaves_yellow',
        targetSymptomKey: 'yellow_new_leaves',
        targetDimension: 'host_confirmation',
        questionTextUserCn: '发黄主要出现在新叶?',
        questionGroupKey: 'yellow_new_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_nitrogen_old_leaves_yellow',
        targetSymptomKey: 'yellow_lower_leaves',
        targetDimension: 'host_confirmation',
        questionTextUserCn: '发黄先从老叶开始?',
        questionGroupKey: 'yellow_old_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_leaf_yellowing_watering_background',
        targetSymptomKey: 'leaf_yellowing',
        targetDimension: 'watering_context',
        questionTextUserCn: '最近浇水节奏更像偏湿还是偏干?',
        questionGroupKey: 'yellowing_watering_background_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_leaf_yellowing_light_background',
        targetSymptomKey: 'leaf_yellowing',
        targetDimension: 'light_exposure',
        questionTextUserCn: '最近光照是更强直晒，还是更弱更阴?',
        questionGroupKey: 'yellowing_light_background_group',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_leaf_yellowing_fertilization_background',
        targetSymptomKey: 'leaf_yellowing',
        targetDimension: 'fertilization_context',
        questionTextUserCn: '最近是否长期停肥或恢复供肥较慢?',
        questionGroupKey: 'yellowing_fertilization_background_group',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [],
    observedSymptoms: [
      {
        symptomKey: 'leaf_yellowing',
        confidence: 0.9,
        signalReliability: 0.72,
        locationKey: 'leaf',
        patternKey: 'chlorosis',
        distributionKey: 'random'
      }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        confidence: 0.9,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'leaf_yellowing',
        locationKey: 'leaf',
        patternKey: 'chlorosis',
        distributionKey: 'random'
      },
      {
        symptomKey: 'yellow_new_leaves',
        locationKey: 'leaf',
        patternKey: 'chlorosis',
        distributionKey: 'new_growth'
      },
      {
        symptomKey: 'yellow_lower_leaves',
        locationKey: 'leaf',
        patternKey: 'chlorosis',
        distributionKey: 'lower'
      }
    ],
    maxQuestions: 3
  })

  const selectedDimensions = selected.map(item => item.targetDimension)
  assert.equal(selected.length, 1, 'yellowing 正式 follow-up 必须遵守单题契约')
  assert.ok(
    selectedDimensions.filter(item => item === 'host_confirmation').length <= 1,
    'yellowing 正式 follow-up 不允许再用多个 host_confirmation 挤掉环境/养护维度'
  )
  assert.ok(
    selectedDimensions.every(item =>
      ['host_confirmation', 'light_exposure', 'watering_context', 'fertilization_context'].includes(item)
    ),
    'leaf_yellowing 正式 follow-up 每轮只能返回一个叶龄/环境/养护维度问题'
  )

  return {
    name: 'observed_context_dimension_diversity_guard',
    ok: true
  }
}

function checkSyntheticObservedProbeScoringGuard() {
  const questionKeys = [
    'q_observed_probe__leaf_yellowing__host_confirmation',
    'q_observed_probe__leaf_yellowing__light_exposure',
    'q_observed_probe__leaf_yellowing__fertilization_context'
  ]
  const optionMappings = buildSyntheticFollowUpOptionMappings(questionKeys, [
    {
      symptomKey: 'leaf_yellowing',
      symptomCn: '叶子明显发黄',
      locationKey: 'leaf'
    }
  ])

  const { questionScores, penalties, answerEffects } = computeQuestionEvidenceAndPenalty({
    answers: [
      { questionKey: 'q_observed_probe__leaf_yellowing__host_confirmation', optionKey: 'no' },
      { questionKey: 'q_observed_probe__leaf_yellowing__light_exposure', optionKey: 'no' },
      { questionKey: 'q_observed_probe__leaf_yellowing__fertilization_context', optionKey: 'yes' }
    ],
    optionMappings,
    candidateProblemKeys: [
      'nitrogen_deficiency',
      'iron_deficiency',
      'root_rot',
      'overwatering',
      'low_light',
      'sunburn'
    ],
    symptomDictionary: [],
    evidenceEdges: []
  })

  assert.ok(
    Number(questionScores.iron_deficiency || 0) > Number(questionScores.overwatering || 0),
    '叶片黄化在“非老叶优先 + 非暴晒 + 长期缺肥背景”时，应更强地推动缺铁/缺营养路径，而不是继续与过湿问题并列'
  )
  assert.equal(
    Number(questionScores.root_rot || 0),
    0,
    'leaf_yellowing 的 generic synthetic probe 不应再直接给 root_rot 正向加分'
  )
  assert.equal(
    Number(questionScores.overwatering || 0),
    0,
    'leaf_yellowing 的 generic synthetic probe 不应再直接给 overwatering 正向加分'
  )
  assert.ok(
    Number(questionScores.low_light || 0) > 0,
    '在明确排除直晒后，light context 仍必须给低光路径留下正向区分度'
  )
  assert.equal(
    Number(questionScores.sunburn || 0),
    0,
    '明确排除直晒背景后，不应继续给日灼路径加分'
  )
  assert.ok(
    Object.values(penalties).some(value => Number(value || 0) > 0),
    '与当前上下文相反的候选问题应能收到反向 penalty，而不是只记录答案文本'
  )
  assert.ok(
    answerEffects.some(item => item.effectType === 'direct_problem_positive'),
    'synthetic context probe 必须留下 direct problem effect，避免 system-wide uncertain'
  )

  return {
    name: 'synthetic_observed_probe_scoring_guard',
    ok: true
  }
}

function checkPestSpecklingObservedProbeGuard() {
  const selected = buildSyntheticObservedProbeQuestions(
    {
      symptomKey: 'yellow_speckling',
      symptomCn: '叶子上有密密麻麻的小黄点',
      locationKey: 'leaf',
      patternKey: 'speckling',
      distributionKey: 'random'
    },
    { maxQuestions: 3 }
  )

  const selectedDimensions = selected.map(item => item.targetDimension)
  assert.equal(selected.length, 1, 'yellow_speckling 每轮只能生成 1 个正交 probe')
  assert.equal(
    selectedDimensions[0],
    'pest_trace_type',
    'yellow_speckling 首题必须优先问刺吸式害虫痕迹类型，区分红蜘蛛/蓟马/蜜露类和非虫害痕迹'
  )
  assert.ok(
    !selectedDimensions.includes('host_confirmation'),
    'yellow_speckling 首题不应把 host_confirmation 提前到虫害痕迹类型分流之前'
  )

  const optionMappings = buildSyntheticFollowUpOptionMappings(
    [
      ...selected.map(item => item.questionKey),
      'q_observed_probe__yellow_speckling__surface_stickiness'
    ],
    [
      {
        symptomKey: 'yellow_speckling',
        symptomCn: '叶子上有密密麻麻的小黄点',
        locationKey: 'leaf'
      }
    ]
  )

  const miteWebbing = optionMappings.find(
    item =>
      item.questionKey === 'q_observed_probe__yellow_speckling__pest_trace_type' &&
      item.optionKey === 'mite_webbing'
  )
  const thripsSilverBlack = optionMappings.find(
    item =>
      item.questionKey === 'q_observed_probe__yellow_speckling__pest_trace_type' &&
      item.optionKey === 'thrips_silver_black'
  )
  const honeydewTrace = optionMappings.find(
    item =>
      item.questionKey === 'q_observed_probe__yellow_speckling__pest_trace_type' &&
      item.optionKey === 'sticky_honeydew'
  )
  const noPestTrace = optionMappings.find(
    item =>
      item.questionKey === 'q_observed_probe__yellow_speckling__pest_trace_type' &&
      item.optionKey === 'no_pest_trace'
  )
  const stickyYes = optionMappings.find(
    item =>
      item.questionKey === 'q_observed_probe__yellow_speckling__surface_stickiness' &&
      item.optionKey === 'yes'
  )
  const stickyNo = optionMappings.find(
    item =>
      item.questionKey === 'q_observed_probe__yellow_speckling__surface_stickiness' &&
      item.optionKey === 'no'
  )

  assert.ok(
    miteWebbing?.directProblemAdjustments?.some(effect => effect.problemKey === 'spider_mites' && Number(effect.scoreDelta || 0) > 0),
    'yellow_speckling 的细网/极小活动点选项需要能直接把红蜘蛛路径拉开'
  )
  assert.ok(
    thripsSilverBlack?.directProblemAdjustments?.some(effect => effect.problemKey === 'thrips' && Number(effect.scoreDelta || 0) > 0),
    'yellow_speckling 的银白擦伤伴黑点选项需要能直接把蓟马路径拉开'
  )
  assert.ok(
    honeydewTrace?.directProblemAdjustments?.some(effect => effect.problemKey === 'whiteflies' && Number(effect.scoreDelta || 0) > 0),
    'yellow_speckling 的蜜露/煤灰选项需要能直接增强白粉虱/蜜露类虫害路径'
  )
  assert.ok(
    noPestTrace?.directProblemAdjustments?.some(effect => effect.problemKey === 'spider_mites' && Number(effect.scoreDelta || 0) < 0),
    'yellow_speckling 的无虫害痕迹选项需要能降低红蜘蛛等刺吸式害虫路径'
  )
  assert.ok(
    stickyYes?.directProblemAdjustments?.some(effect => effect.problemKey === 'whiteflies' && Number(effect.scoreDelta || 0) > 0),
    'yellow_speckling 的黏腻题在 yes 时需要能直接增强白粉虱/蜜露类虫害路径'
  )
  assert.ok(
    stickyNo?.directProblemAdjustments?.some(effect => effect.problemKey === 'spider_mites' && Number(effect.scoreDelta || 0) > 0),
    'yellow_speckling 的黏腻题在 no 时需要给红蜘蛛留出正向区分度'
  )

  return {
    name: 'pest_speckling_observed_probe_guard',
    ok: true,
    targetDimensions: selectedDimensions
  }
}

function checkPestSpecklingDirectionManagedVisualPresenceGuard() {
  const diagnosisDirections = [
    {
      directionKey: 'pest_direction',
      matchedSymptomKeys: ['yellow_speckling'],
      matchedCandidateSymptomKeys: [],
      preferredQuestionDimensions: [
        'underside_presence',
        'surface_stickiness',
        'distribution_scope'
      ]
    }
  ]

  const selected = selectFollowUpQuestions({
    rankings: [{ problemKey: 'spider_mites', finalScore: 0.9, baseScore: 0.9 }],
    strategies: [
      {
        problemKey: 'spider_mites',
        questionKey: 'q_yellowing_patchy_yellow_speckling',
        priorityScore: 100,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'spider_mites',
        questionKey: 'q_observed_probe__yellow_speckling__underside_presence',
        priorityScore: 95,
        reviewStatus: 'audited'
      }
    ],
    questions: [
      {
        questionKey: 'q_yellowing_patchy_yellow_speckling',
        targetSymptomKey: 'yellow_speckling',
        targetDimension: 'visual_presence',
        routingScope: 'symptom_confirmation',
        questionGroupKey: 'yellowing_patchy_context_group',
        questionTextUserCn: '黄化区里是否还能看到密集细小失绿点或针刺样黄点？',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_observed_probe__yellow_speckling__underside_presence',
        targetSymptomKey: 'yellow_speckling',
        targetDimension: 'underside_presence',
        routingScope: 'differential_probe',
        questionGroupKey: 'observed_probe__yellow_speckling__underside_presence',
        questionTextUserCn: '翻看叶背或阴面时，这些细小黄点/失绿点是否更明显？',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [],
    observedEvidenceSet: [
      {
        observedEvidenceSetId: 'ev_yellow_speckling',
        symptomKey: 'yellow_speckling',
        confidence: 0.88,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ],
    observedSymptoms: [
      {
        symptomKey: 'yellow_speckling',
        confidence: 0.88,
        signalReliability: 0.9,
        locationKey: 'leaf',
        patternKey: 'speckling',
        distributionKey: 'random'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'yellow_speckling',
        locationKey: 'leaf',
        patternKey: 'speckling',
        distributionKey: 'random'
      }
    ],
    diagnosisDirections,
    maxQuestions: 2
  })

  assert.ok(
    !selected.some(item => item.questionKey === 'q_yellowing_patchy_yellow_speckling'),
    'yellow_speckling 已进入 pest_direction 时，不允许再回到 same-dimension 的 visual_presence 确认题'
  )
  assert.ok(
    selected.some(item => item.questionKey === 'q_observed_probe__yellow_speckling__underside_presence'),
    'yellow_speckling 已进入 pest_direction 时，必须优先保留叶背/正交维度问题'
  )

  return {
    name: 'pest_speckling_direction_managed_visual_presence_guard',
    ok: true
  }
}

function checkExplicitObservedSymptomGuard() {
  const explicitObservedSymptomKeySet = buildExplicitObservedSymptomKeySet([
    {
      symptomKey: 'leaf_yellowing',
      sourceType: 'legacy_observed_symptom',
      currentStatus: 'active'
    },
    {
      symptomKey: 'water_soaked_stem',
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    },
    {
      symptomKey: 'poor_drainage',
      sourceType: 'follow_up_positive',
      currentStatus: 'active'
    },
    {
      symptomKey: 'soft_stem',
      sourceType: 'follow_up_seed',
      currentStatus: 'superseded'
    }
  ])

  assert.ok(
    explicitObservedSymptomKeySet.has('leaf_yellowing'),
    '首轮显式传入的 legacy_observed_symptom 必须被视为 explicit observed symptom'
  )
  assert.ok(
    explicitObservedSymptomKeySet.has('poor_drainage'),
    'follow_up_positive 仍必须保留 explicit observed 语义'
  )
  assert.ok(
    !explicitObservedSymptomKeySet.has('water_soaked_stem'),
    '纯 visual_admitted symptom 不应被误当成 explicit observed symptom'
  )
  assert.ok(
    !explicitObservedSymptomKeySet.has('soft_stem'),
    '已 superseded 的 symptom 不应继续参与 explicit observed seed'
  )

  return {
    name: 'explicit_observed_symptom_guard',
    ok: true
  }
}

function checkStemSoftnessSyntheticScoringGuard() {
  const questionKeys = [
    'q_observed_probe__water_soaked_stem__host_confirmation',
    'q_observed_probe__water_soaked_stem__progression',
    'q_observed_probe__soft_stem__host_confirmation',
    'q_observed_probe__soft_stem__progression'
  ]
  const optionMappings = buildSyntheticFollowUpOptionMappings(questionKeys, [
    {
      symptomKey: 'water_soaked_stem',
      symptomCn: '茎部带水渍感',
      locationKey: 'stem'
    },
    {
      symptomKey: 'soft_stem',
      symptomCn: '茎部发软',
      locationKey: 'stem'
    }
  ])

  const { questionScores } = computeQuestionEvidenceAndPenalty({
    answers: [
      { questionKey: 'q_observed_probe__water_soaked_stem__host_confirmation', optionKey: 'yes' },
      { questionKey: 'q_observed_probe__water_soaked_stem__progression', optionKey: 'yes' },
      { questionKey: 'q_observed_probe__soft_stem__host_confirmation', optionKey: 'yes' },
      { questionKey: 'q_observed_probe__soft_stem__progression', optionKey: 'yes' }
    ],
    optionMappings,
    candidateProblemKeys: [
      'root_rot',
      'crown_rot',
      'soft_rot',
      'overwatering',
      'poor_drainage',
      'root_stress',
      'general_stress'
    ],
    symptomDictionary: [],
    evidenceEdges: []
  })

  assert.equal(
    Number(questionScores.root_rot || 0),
    0,
    'water_soaked_stem/soft_stem 的 generic synthetic probe 不应再直接给 root_rot 正向加分'
  )
  assert.equal(
    Number(questionScores.crown_rot || 0),
    0,
    'water_soaked_stem/soft_stem 的 generic synthetic probe 不应再直接给 crown_rot 正向加分'
  )
  assert.equal(
    Number(questionScores.soft_rot || 0),
    0,
    'water_soaked_stem/soft_stem 的 generic synthetic probe 不应再直接给 soft_rot 正向加分'
  )
  assert.equal(
    Number(questionScores.overwatering || 0),
    0,
    'water_soaked_stem/soft_stem 的 generic synthetic probe 不应再直接给 overwatering 正向加分'
  )
  assert.ok(
    Number(questionScores.poor_drainage || 0) > 0 ||
      Number(questionScores.root_stress || 0) > 0 ||
      Number(questionScores.general_stress || 0) > 0,
    'generic synthetic probe 仍应保留风险提示分，而不是完全失去信号'
  )

  return {
    name: 'stem_softness_synthetic_scoring_guard',
    ok: true
  }
}

function checkContextRequiredProblemGuard() {
  const withoutContext = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'root_rot', finalScore: 0.66 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(withoutContext.applies, true, 'root_rot 应落入上下文依赖型问题守卫')
  assert.equal(
    withoutContext.hasRequiredContext,
    false,
    '只有 leaf_yellowing 时不应视为已补齐 root_rot 上下文'
  )
  assert.ok(
    withoutContext.preferredQuestionKeys.includes('q_root_rot_bad_smell'),
    'root_rot 守卫必须显式拉起 audited context question'
  )

  const visualOnlyCorroboration = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'root_rot', finalScore: 0.74 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      },
      {
        symptomKey: 'water_soaked_stem',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    visualOnlyCorroboration.hasRequiredContext,
    false,
    '纯视觉茎部湿软/水渍症状不能被当成 root_rot 已具备上下文'
  )

  const overwateringVisualOnlyCorroboration = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'overwatering', finalScore: 0.68 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      },
      {
        symptomKey: 'edema',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    overwateringVisualOnlyCorroboration.hasRequiredContext,
    false,
    'edema 这类纯视觉症状不能被当成 overwatering 已具备上下文'
  )

  const lowLightWithoutContext = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'low_light', finalScore: 0.67 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    lowLightWithoutContext.applies,
    true,
    'low_light 必须进入 context-required guard，不能只凭黄叶视觉证据直接收口'
  )
  assert.equal(
    lowLightWithoutContext.hasRequiredContext,
    false,
    '没有 low_light_context 等光照背景事实时，low_light 不应视为已具备上下文'
  )

  const lowLightWithContext = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'low_light', finalScore: 0.72 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      },
      {
        symptomKey: 'low_light_context',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    lowLightWithContext.hasRequiredContext,
    true,
    '出现 low_light_context 后，low_light guard 应视为已具备上下文支撑'
  )

  const withContext = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'root_rot', finalScore: 0.78 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      },
      {
        symptomKey: 'wilting_wet_soil',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    withContext.hasRequiredContext,
    true,
    '出现 wilting_wet_soil 这类根区强事实后，root_rot guard 应视为已具备上下文支撑'
  )

  const weakContextOnly = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'root_rot', finalScore: 0.73 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      },
      {
        symptomKey: 'poor_drainage',
        currentStatus: 'active'
      },
      {
        symptomKey: 'watering_excess_background',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    weakContextOnly.hasRequiredContext,
    false,
    'poor_drainage / watering_excess_background 这类弱背景事实不能单独放行 root_rot'
  )

  const mealybugsWithoutContext = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'mealybugs', finalScore: 0.81 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    mealybugsWithoutContext.applies,
    true,
    'mealybugs 必须进入 context-required guard，不能只凭泛化黄化或模糊白点直接收口'
  )
  assert.equal(
    mealybugsWithoutContext.hasRequiredContext,
    false,
    '没有蜜露/煤污等刺吸式害虫事实时，mealybugs 不应视为已具备上下文'
  )
  assert.ok(
    mealybugsWithoutContext.preferredQuestionKeys.includes('q_sticky_honeydew_confirm'),
    'mealybugs guard 必须优先强制蜜露确认题'
  )

  const mealybugsWithContext = evaluateContextRequiredProblemGuard({
    rankings: [
      { problemKey: 'mealybugs', finalScore: 0.86 }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'sticky_honeydew',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    mealybugsWithContext.hasRequiredContext,
    true,
    '出现 sticky_honeydew 后，mealybugs guard 应视为已具备上下文支撑'
  )

  return {
    name: 'context_required_problem_guard',
    ok: true
  }
}

function checkHighSpecificityFastConvergenceGuard() {
  const blockedTargetSymptomKeys = getHighSpecificityQuestionBlockedSymptomKeys({
    policy: HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_FOLLOW_UP
  })

  assert.ok(
    !blockedTargetSymptomKeys.includes('fine_webbing'),
    '红蜘蛛 fine_webbing 不应被归入 zero_follow_up 的 question block 列表'
  )

  const plan = resolveHighSpecificityConvergencePlan({
    visualAggregateResult: {
      aggregate_analyzability: 'high',
      aggregated_symptom_candidates: [
        {
          symptom_key: 'fine_webbing',
          support_organs: ['leaf'],
          confidence_band: 'high',
          strength_level: 'medium'
        }
      ],
      admission_records: [
        {
          admission_result: 'formally_admitted',
          object_key: 'fine_webbing',
          candidate: {
            symptom_key: 'fine_webbing',
            support_organs: ['leaf'],
            confidence_band: 'high',
            strength_level: 'medium'
          }
        }
      ]
    },
    visualRouteContext: {
      routePrimaryAction: 'ask_first'
    },
    observedEvidenceSet: [
      {
        symptomKey: 'fine_webbing',
        confidence: 0.95,
        sourceType: 'visual_admitted'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'fine_webbing',
        signalReliability: 0.9
      }
    ],
    rankings: [
      {
        problemKey: 'spider_mites',
        finalScore: 0.98,
        baseScore: 0.98
      }
    ],
    problems: [
      {
        problemKey: 'spider_mites',
        problemRole: 'root_cause'
      }
    ]
  })

  assert.equal(
    plan?.policy,
    HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.SINGLE_CONFIRMATION,
    '红蜘蛛 fine_webbing 命中时，应进入 single_confirmation 快速收敛而不是 zero_follow_up'
  )
  assert.equal(
    Boolean(plan?.shouldBypassFollowUp),
    false,
    'red spider fine_webbing 不应默认绕过 follow-up'
  )
  assert.equal(
    Number(plan?.maxQuestions || 0),
    1,
    'red spider fine_webbing 只允许 1 个高收益确认题'
  )

  return {
    name: 'high_specificity_fast_convergence_guard',
    ok: true,
    blockedTargetSymptomKeys,
    plan
  }
}

function checkEvidenceSourceIsolationGuard() {
  const candidateProblemKeys = ['black_spot']
  const symptomDictionary = [
    {
      symptomKey: 'black_spots_spreading',
      signalReliability: 0.85
    }
  ]
  const evidenceEdges = [
    {
      problemKey: 'black_spot',
      symptomKey: 'black_spots_spreading',
      associationStrength: 0.8,
      edgeReliability: 0.85
    }
  ]

  const visualOnlyScores = computeVisualEvidenceScores({
    candidateProblemKeys,
    observedEvidenceSet: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.85,
        sourceType: 'visual_admitted',
        enteredRuntime: 1,
        currentStatus: 'active'
      }
    ],
    symptomDictionary,
    evidenceEdges
  })
  const followUpOnlyScores = computeVisualEvidenceScores({
    candidateProblemKeys,
    observedEvidenceSet: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 1,
        sourceType: 'follow_up_positive',
        enteredRuntime: 1,
        currentStatus: 'active'
      }
    ],
    symptomDictionary,
    evidenceEdges
  })

  assert.ok(
    Number(visualOnlyScores.black_spot || 0) > 0,
    'visual_admitted symptom 必须能贡献 visual evidence'
  )
  assert.equal(
    Number(followUpOnlyScores.black_spot || 0),
    0,
    'follow_up_positive symptom 不允许再次作为 visual evidence 参与评分'
  )

  return {
    name: 'evidence_source_isolation_guard',
    ok: true
  }
}

function checkCorroboratedConvergenceGuard() {
  const lowConfidence = resolveLowConfidenceState({
    rankings: [
      {
        problemKey: 'fungal_leaf_spot',
        problemRole: 'root_cause',
        visualEvidence: 0.578,
        questionEvidence: 1.156,
        finalScore: 0.83
      },
      {
        problemKey: 'black_spot',
        problemRole: 'root_cause',
        visualEvidence: 0.52,
        questionEvidence: 1.04,
        finalScore: 0.76
      }
    ],
    observedSymptoms: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.85
      }
    ],
    noHighValueQuestion: true,
    problemRoleByKey: {
      fungal_leaf_spot: 'root_cause',
      black_spot: 'root_cause'
    }
  })

  assert.equal(
    lowConfidence.isLowConfidence,
    false,
    '已存在视觉+追问双重正证据且无更高价值问题时，不应只因 score_gap_small 退化为 uncertain'
  )

  const resultStateHeadLowConfidence = resolveLowConfidenceState({
    rankings: [
      {
        problemKey: 'chlorosis',
        problemRole: 'result_state',
        visualEvidence: 0,
        questionEvidence: 0,
        finalScore: 0.82
      },
      {
        problemKey: 'iron_deficiency',
        problemRole: 'root_cause',
        visualEvidence: 0.41,
        questionEvidence: 0.36,
        finalScore: 0.47
      },
      {
        problemKey: 'nitrogen_deficiency',
        problemRole: 'root_cause',
        visualEvidence: 0.32,
        questionEvidence: 0.18,
        finalScore: 0.29
      }
    ],
    observedSymptoms: [
      {
        symptomKey: 'leaf_yellowing',
        confidence: 0.84
      },
      {
        symptomKey: 'yellow_new_leaves',
        confidence: 0.81
      }
    ],
    observedEvidenceSet: [
      {
        symptomKey: 'leaf_yellowing',
        currentStatus: 'active'
      },
      {
        symptomKey: 'fertilization_gap',
        currentStatus: 'active'
      },
      {
        symptomKey: 'yellow_new_leaves',
        currentStatus: 'active'
      }
    ],
    noHighValueQuestion: true,
    problemRoleByKey: {
      chlorosis: 'result_state',
      iron_deficiency: 'root_cause',
      nitrogen_deficiency: 'root_cause'
    }
  })

  assert.equal(
    resultStateHeadLowConfidence.isLowConfidence,
    false,
    'raw ranking 头部是 result_state 时，uncertain gate 必须改按 output-eligible root_cause 计算'
  )

  const response = {
    diagnosisSessionId: 'diag_guard',
    roundId: 'round_2',
    stage: 'final',
    followUpRequired: false,
    outcomeType: 'problematic',
    outcomeLocked: 'problematic',
    stopReason: 'problematic_output_ready',
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'problematic_output_ready',
      uncertainLegalityReason: ''
    },
    confidenceReasons: [],
    finalResult: {
      resultId: 'r_guard',
      summary: '当前最像真菌叶斑。'
    }
  }
  const questionQueue = {
    questionItems: [],
    queueStatus: 'exhausted'
  }
  const stopState = evaluateStopState({ response, questionQueue })
  const outputEligibility = evaluateOutputEligibility({
    response,
    questionQueue,
    stopState
  })

  assert.equal(stopState.isStopped, 1, '已收敛到正式问题输出时，stop_state 必须允许停止')
  assert.equal(outputEligibility.eligible, 1, '已收敛到正式问题输出时，output eligibility 必须为 eligible')

  return {
    name: 'corroborated_convergence_guard',
    ok: true
  }
}

function checkFormalUncertainGuard() {
  const lowConfidenceWithoutLegality = resolveLowConfidenceState({
    rankings: [
      {
        problemKey: 'fungal_leaf_spot',
        problemRole: 'root_cause',
        visualEvidence: 0.4,
        questionEvidence: 0.2,
        finalScore: 0.61
      },
      {
        problemKey: 'bacterial_leaf_spot',
        problemRole: 'root_cause',
        visualEvidence: 0.38,
        questionEvidence: 0.21,
        finalScore: 0.58
      }
    ],
    observedSymptoms: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.52
      }
    ],
    noHighValueQuestion: false,
    problemRoleByKey: {
      fungal_leaf_spot: 'root_cause',
      bacterial_leaf_spot: 'root_cause'
    }
  })

  assert.equal(
    lowConfidenceWithoutLegality.uncertainLegalityReason,
    '',
    '没有 formal 停止理由时，不允许仅凭 low-confidence heuristics 生成 uncertain legality'
  )

  const problematicResponse = formatDiagnosisResponse({
    sessionId: 'diag_formal_problematic',
    round: 2,
    stage: 'final',
    observedSymptoms: [],
    rankings: [
      {
        problemKey: 'fungal_leaf_spot',
        problemCn: '真菌叶斑',
        finalScore: 0.61,
        baseScore: 0.61,
        visualEvidence: 0.4,
        questionEvidence: 0.2,
        totalEvidence: 0.6,
        evidenceCount: 2,
        rankNo: 1
      }
    ],
    followUps: [],
    problems: [
      {
        problemKey: 'fungal_leaf_spot',
        displayNameCn: '真菌叶斑',
        problemRole: 'root_cause',
        severityHintCn: '中',
        urgencyHintCn: '中'
      }
    ],
    explanations: [],
    causality: [],
    plantId: '1',
    followUpRequired: false,
    lowConfidence: lowConfidenceWithoutLegality,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'problematic_output_ready',
      uncertainLegalityReason: ''
    }
  })

  assert.equal(
    problematicResponse.outcomeType,
    'problematic',
    '没有 formal uncertain legality 时，final 输出必须保持 problematic'
  )

  const lowConfidenceWithLegality = resolveLowConfidenceState({
    rankings: [
      {
        problemKey: 'fungal_leaf_spot',
        problemRole: 'root_cause',
        visualEvidence: 0.3,
        questionEvidence: 0.1,
        finalScore: 0.52
      },
      {
        problemKey: 'bacterial_leaf_spot',
        problemRole: 'root_cause',
        visualEvidence: 0.29,
        questionEvidence: 0.1,
        finalScore: 0.5
      }
    ],
    observedSymptoms: [
      {
        symptomKey: 'black_spots_spreading',
        confidence: 0.49
      }
    ],
    noHighValueQuestion: true,
    unknownCountByGroup: {
      lesion_texture: 2
    },
    problemRoleByKey: {
      fungal_leaf_spot: 'root_cause',
      bacterial_leaf_spot: 'root_cause'
    }
  })

  assert.equal(
    lowConfidenceWithLegality.uncertainLegalityReason,
    'input_unfillable',
    '无高价值题且关键组未知时，必须生成 formal uncertain legality'
  )

  const uncertainResponse = formatDiagnosisResponse({
    sessionId: 'diag_formal_uncertain',
    round: 2,
    stage: 'final',
    observedSymptoms: [],
    rankings: [
      {
        problemKey: 'fungal_leaf_spot',
        problemCn: '真菌叶斑',
        finalScore: 0.52,
        baseScore: 0.52,
        visualEvidence: 0.3,
        questionEvidence: 0.1,
        totalEvidence: 0.4,
        evidenceCount: 2,
        rankNo: 1
      }
    ],
    followUps: [],
    problems: [
      {
        problemKey: 'fungal_leaf_spot',
        displayNameCn: '真菌叶斑',
        problemRole: 'root_cause',
        severityHintCn: '中',
        urgencyHintCn: '中'
      }
    ],
    explanations: [],
    causality: [],
    plantId: '1',
    followUpRequired: false,
    lowConfidence: lowConfidenceWithLegality,
    stopDecision: {
      outcomeLocked: 'uncertain',
      stopReason: 'uncertain_output_ready',
      uncertainLegalityReason: lowConfidenceWithLegality.uncertainLegalityReason
    }
  })

  assert.equal(
    uncertainResponse.outcomeType,
    'uncertain',
    '只有存在 formal uncertain legality 时，final 才允许输出 uncertain'
  )

  const stopState = evaluateStopState({
    response: uncertainResponse,
    questionQueue: {
      questionItems: [],
      queueStatus: 'exhausted'
    }
  })
  const outputEligibility = evaluateOutputEligibility({
    response: uncertainResponse,
    questionQueue: {
      questionItems: [],
      queueStatus: 'exhausted'
    },
    stopState
  })

  assert.equal(stopState.isStopped, 1, 'formal uncertain legality 存在时，stop_state 才允许 uncertain 停止')
  assert.equal(outputEligibility.eligible, 1, 'formal uncertain legality 存在时，output eligibility 才允许 uncertain 输出')

  return {
    name: 'formal_uncertain_guard',
    ok: true
  }
}

function checkDecisionCausePropagationGuard() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_decision_cause_guard',
    round: 2,
    stage: 'final',
    observedSymptoms: [],
    rankings: [],
    followUps: [],
    problems: [],
    explanations: [],
    causality: [],
    plantId: '1',
    followUpRequired: false,
    lowConfidence: {
      isLowConfidence: true,
      reasons: ['context_required_problem_unconfirmed'],
      advice: ['当前缺少关键上下文。'],
      uncertainLegalityReason: 'input_unfillable'
    },
    stopDecision: {
      outcomeLocked: 'uncertain',
      stopReason: 'uncertain_output_ready',
      stopReasonDetail: 'class_converged_context_guard_blocked',
      uncertainLegalityReason: 'input_unfillable',
      decisionCause: {
        decisionCauseKey: 'class_converged_context_guard_blocked',
        decisionCauseCategory: 'context_guard_block',
        decisionCauseText: '当前 class 已收敛，但 root cause 缺少必要上下文。'
      }
    }
  })

  const questionQueue = planQuestionQueue(response)
  const stopState = evaluateStopState({
    response,
    questionQueue
  })
  const outputEligibility = evaluateOutputEligibility({
    response,
    questionQueue,
    stopState
  })

  assert.equal(
    questionQueue.queueDecision?.decisionCauseKey,
    'class_converged_context_guard_blocked',
    'questionQueue 必须保留 explicit decisionCauseKey，供 history/review 回放'
  )
  assert.equal(
    stopState.stopReasonType,
    'uncertain_class_converged_context_guard_blocked',
    'stopState 必须把 class 收敛后被 context guard 拦下建模成独立 stopReasonType'
  )
  assert.equal(
    outputEligibility.decisionCauseKey,
    'class_converged_context_guard_blocked',
    'outputEligibility 也必须透出同一 decisionCauseKey'
  )

  return {
    name: 'decision_cause_propagation_guard',
    ok: true
  }
}

function checkDerivedEvidenceAndCareBaselineGuard() {
  const observedEvidenceSet = [
    {
      observedEvidenceSetId: 'visual_admitted::leaf_bleaching',
      evidenceKey: 'leaf_bleaching',
      symptomKey: 'leaf_bleaching',
      symptomCn: '叶片漂白/发白',
      confidence: 0.91,
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    }
  ]
  const derivedEvidenceSet = buildDerivedEvidenceSet({
    observedEvidenceSet,
    symptomDictionary: [
      {
        symptomKey: 'leaf_bleaching',
        locationKey: 'leaf',
        patternKey: 'burn',
        distributionKey: 'patches'
      }
    ]
  })

  assert.ok(
    derivedEvidenceSet.some(item => item.derivedEvidenceType === 'pattern'),
    'visual_admitted symptom 必须能派生出 formal pattern evidence'
  )

  const response = formatDiagnosisResponse({
    sessionId: 'diag_guard',
    round: 2,
    stage: 'final',
    observedSymptoms: [
      {
        symptomKey: 'leaf_bleaching',
        symptomCn: '叶片漂白/发白',
        confidence: 0.91,
        signalReliability: 0.88,
        locationKey: 'leaf',
        patternKey: 'burn',
        distributionKey: 'patches'
      }
    ],
    observedEvidenceSet,
    derivedEvidenceSet,
    rankings: [
      {
        problemKey: 'sunburn',
        problemCn: '晒伤/日灼',
        visualEvidence: 0.78,
        questionEvidence: 0.24,
        totalEvidence: 1.02,
        penalty: 0,
        hostCompatibility: 1,
        genusCompatibility: 1,
        evidenceCount: 2,
        finalScore: 0.92,
        baseScore: 0.92,
        rankNo: 1
      }
    ],
    followUps: [],
    problems: [
      {
        problemKey: 'sunburn',
        displayNameCn: '晒伤/日灼',
        problemRole: 'root_cause',
        severityHintCn: '中',
        urgencyHintCn: '中'
      }
    ],
    explanations: [],
    causality: [],
    plantContext: {
      genus: 'Monstera',
      watering: { way: '见干浇透', freq: [5, 10], unit: '天', verb: '浇' },
      sunning: { way: '明亮散射光', freq: [4, 8], unit: '小时/天', other: '避免直晒' },
      ventilation: { level: 'medium', sensitivity: 'medium' }
    },
    plantId: 'user_plant_1',
    followUpRequired: false,
    lowConfidence: { isLowConfidence: false, reasons: [], advice: [] },
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'problematic_output_ready',
      uncertainLegalityReason: ''
    }
  })

  assert.ok(
    Array.isArray(response.derivedEvidenceSet) && response.derivedEvidenceSet.length > 0,
    'public response 必须携带 formal derivedEvidenceSet'
  )
  assert.ok(
    response.diagnosticTrace.some(item => item.eventType === 'derived_evidence_generated'),
    'runtime artifacts 必须显式记录 derived evidence generation'
  )
  assert.ok(
    response.careBaselineSummary?.light,
    'care baseline summary 必须进入 explanation/action 层，而不是在 prior repository 被丢弃'
  )
  assert.ok(
    response.environmentDeviationHints.length > 0,
    'care baseline 被消费后，response 必须给出环境偏离提示'
  )

  return {
    name: 'derived_evidence_and_care_baseline_guard',
    ok: true
  }
}

function checkDiagnosisDirectionsGuard() {
  const observedEvidenceSet = [
    {
      observedEvidenceSetId: 'ev_leaf_yellowing',
      symptomKey: 'leaf_yellowing',
      confidence: 0.86,
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    },
    {
      observedEvidenceSetId: 'ev_yellow_speckling',
      symptomKey: 'yellow_speckling',
      confidence: 0.88,
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    },
    {
      observedEvidenceSetId: 'ev_powder_white',
      symptomKey: 'powder_white',
      confidence: 0.91,
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    }
  ]
  const derivedEvidenceSet = buildDerivedEvidenceSet({
    observedEvidenceSet,
    symptomDictionary: [
      {
        symptomKey: 'leaf_yellowing',
        locationKey: 'leaf',
        patternKey: '',
        distributionKey: 'multi_leaf'
      },
      {
        symptomKey: 'yellow_speckling',
        locationKey: 'leaf',
        patternKey: 'speckling',
        distributionKey: 'multi_leaf'
      },
      {
        symptomKey: 'powder_white',
        locationKey: 'leaf',
        patternKey: 'powder',
        distributionKey: 'patches'
      }
    ]
  })
  const diagnosisDirections = buildDiagnosisDirections({
    observedEvidenceSet,
    derivedEvidenceSet
  })
  const directionKeys = diagnosisDirections.map(item => item.directionKey)

  assert.ok(
    directionKeys.includes('yellowing_direction'),
    'leaf_yellowing 入证后必须派生 yellowing_direction'
  )
  assert.ok(
    directionKeys.includes('pest_direction'),
    'yellow_speckling 入证后必须派生 pest_direction'
  )
  assert.ok(
    directionKeys.includes('mold_direction'),
    'powder_white 入证后必须派生 mold_direction'
  )

  const pestDirection = diagnosisDirections.find(item => item.directionKey === 'pest_direction')
  assert.equal(
    pestDirection?.preferredQuestionDimensions?.[0],
    'underside_presence',
    '虫害方向必须把 underside_presence 作为首要正交维度'
  )

  return {
    name: 'diagnosis_directions_guard',
    ok: true,
    directionKeys
  }
}

function checkHealthyDirectionGuard() {
  const diagnosisDirections = buildDiagnosisDirections({
    observedEvidenceSet: [],
    derivedEvidenceSet: [],
    visualCandidateSymptoms: [],
    routeHints: [
      {
        type: 'possible_non_problematic_signal',
        reason: 'hf_label_healthy_requires_non_problematic_whitelist',
        score: 0.94,
        label: 'healthy'
      }
    ]
  })
  const healthyDirection = diagnosisDirections.find(item => item.directionKey === 'healthy_direction')
  const nonProblematicRule = resolveNonProblematicRule({
    observedSymptoms: [],
    observedEvidenceSet: [],
    derivedEvidenceSet: [],
    diagnosisDirections
  })

  assert.ok(
    healthyDirection,
    'HF healthy route hint 必须派生 healthy_direction，而不是只在 route hint 层悬空'
  )
  assert.ok(
    healthyDirection.matchedRouteHintTypes.includes('possible_non_problematic_signal'),
    'healthy_direction 必须显式携带 possible_non_problematic_signal 匹配痕迹'
  )
  assert.equal(
    nonProblematicRule?.key,
    'current_no_obvious_problem',
    '高分 healthy_direction 且无正式问题性证据时，必须允许进入 guarded non-problematic outcome'
  )

  return {
    name: 'healthy_direction_guard',
    ok: true
  }
}

function checkChewingDirectionGuard() {
  const observedEvidenceSet = [
    {
      observedEvidenceSetId: 'ev_chewed_edges',
      symptomKey: 'chewed_edges',
      confidence: 0.9,
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    }
  ]
  const derivedEvidenceSet = buildDerivedEvidenceSet({
    observedEvidenceSet,
    symptomDictionary: [
      {
        symptomKey: 'chewed_edges',
        locationKey: 'leaf',
        patternKey: 'chew',
        distributionKey: 'local'
      }
    ]
  })
  const diagnosisDirections = buildDiagnosisDirections({
    observedEvidenceSet,
    derivedEvidenceSet
  })
  const pestDirection = diagnosisDirections.find(item => item.directionKey === 'pest_direction')

  assert.ok(
    pestDirection,
    'chewed_edges 入证后必须派生 pest_direction，不能继续只有 leaf spot / 叶斑病方向'
  )
  assert.ok(
    pestDirection.allowedProblemKeys.includes('chewing_insects') &&
      pestDirection.allowedProblemKeys.includes('caterpillars') &&
      pestDirection.allowedProblemKeys.includes('snails_slugs') &&
      !pestDirection.allowedProblemKeys.includes('leaf_miners'),
    'chewed_edges 只能放开叶缘/孔洞取食类问题，不能无隧道证据时放开 leaf_miners'
  )

  const tunnelEvidenceSet = [
    {
      observedEvidenceSetId: 'ev_tunnels_in_leaf',
      symptomKey: 'tunnels_in_leaf',
      confidence: 0.9,
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    }
  ]
  const tunnelDerivedEvidenceSet = buildDerivedEvidenceSet({
    observedEvidenceSet: tunnelEvidenceSet,
    symptomDictionary: [
      {
        symptomKey: 'tunnels_in_leaf',
        locationKey: 'leaf',
        patternKey: 'tunnels',
        distributionKey: 'local'
      }
    ]
  })
  const tunnelDirections = buildDiagnosisDirections({
    observedEvidenceSet: tunnelEvidenceSet,
    derivedEvidenceSet: tunnelDerivedEvidenceSet
  })
  const tunnelPestDirection = tunnelDirections.find(item => item.directionKey === 'pest_direction')

  assert.ok(
    tunnelPestDirection?.allowedProblemKeys.includes('leaf_miners'),
    'tunnels_in_leaf / tunnels 模式入证后必须放开 leaf_miners'
  )

  return {
    name: 'chewing_direction_guard',
    ok: true
  }
}

function checkChewingVisualCandidateSeedGuard() {
  const candidate = {
    symptomKey: 'holes_in_leaf',
    symptomCn: '叶片上有明显孔洞',
    locationKey: 'leaf',
    patternKey: 'holes',
    confidenceBand: 'medium',
    strengthLevel: 'medium',
    admissionReadiness: 'cautious',
    supportCount: 1
  }

  assert.ok(
    shouldUseVisualCandidateSeedQuestion(candidate),
    'holes_in_leaf / chewing_damage 这类 candidate_retained 视觉症状必须允许进入 visual candidate seed path'
  )

  const syntheticCandidateQuestion = buildSyntheticVisualCandidateQuestion(candidate)
  assert.equal(
    syntheticCandidateQuestion?.questionKey,
    buildSyntheticVisualCandidateQuestionKey('holes_in_leaf'),
    'candidate_retained 的 holes_in_leaf 必须先生成 visual candidate confirm 题，而不是直接跳到其他维度'
  )
  assert.equal(
    syntheticCandidateQuestion?.targetDimension,
    'visual_presence',
    'visual candidate confirm 题必须显式落在 visual_presence 维度'
  )
  assert.equal(
    syntheticCandidateQuestion?.routingScope,
    'symptom_confirmation',
    'visual candidate confirm 题必须走 symptom_confirmation，而不是直接走 differential_probe'
  )

  const orthogonalQuestions = buildSyntheticObservedProbeQuestions(candidate, { maxQuestions: 1 })
  assert.equal(
    orthogonalQuestions?.[0]?.targetDimension,
    'structural_cause',
    'holes_in_leaf 的正交 probe 应进入 structural_cause 分流，避免在已有孔洞后重复确认是否有洞'
  )

  return {
    name: 'chewing_visual_candidate_seed_guard',
    ok: true,
    questionKey: syntheticCandidateQuestion?.questionKey || ''
  }
}

function checkStructuralOutOfPoolHintSeedGuard() {
  const outOfPoolStructuralCandidate = {
    symptomKey: 'holes_in_leaf',
    symptomCn: '叶片上有明显孔洞',
    locationKey: 'leaf',
    patternKey: 'holes',
    confidenceBand: 'low',
    strengthLevel: 'weak',
    admissionReadiness: 'cautious',
    supportCount: 1,
    candidateSource: 'out_of_pool_hint'
  }

  assert.ok(
    shouldUseVisualCandidateSeedQuestion(outOfPoolStructuralCandidate),
    '单张图命中的 structural out_of_pool hint 也必须允许先走 visual candidate confirm，不能直接跳正交 probe'
  )

  const syntheticCandidateQuestion = buildSyntheticVisualCandidateQuestion(
    outOfPoolStructuralCandidate
  )
  assert.equal(
    syntheticCandidateQuestion?.questionKey,
    buildSyntheticVisualCandidateQuestionKey('holes_in_leaf'),
    'structural out_of_pool hint 必须仍然生成 q_visual_candidate_confirm__*'
  )

  return {
    name: 'structural_out_of_pool_hint_seed_guard',
    ok: true,
    questionKey: syntheticCandidateQuestion?.questionKey || ''
  }
}

function checkMoldOutOfPoolHintSeedGuard() {
  const outOfPoolMoldCandidate = {
    symptomKey: 'brown_spots_halo',
    symptomCn: '褐斑带黄晕',
    locationKey: 'leaf',
    patternKey: 'spots',
    signalReliability: 0.82,
    confidenceBand: 'low',
    strengthLevel: 'weak',
    admissionReadiness: 'cautious',
    supportCount: 1,
    candidateSource: 'out_of_pool_hint'
  }

  assert.ok(
    shouldUseVisualCandidateSeedQuestion(outOfPoolMoldCandidate),
    'brown/mold 类 out_of_pool hint 不能再因为 supportCount=1 被直接丢成 no_high_value_question'
  )

  return {
    name: 'mold_out_of_pool_hint_seed_guard',
    ok: true
  }
}

function checkMoldDirectionCoverageGuard() {
  const observedEvidenceSet = [
    {
      observedEvidenceSetId: 'ev_brown_spots_halo',
      symptomKey: 'brown_spots_halo',
      confidence: 0.88,
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    },
    {
      observedEvidenceSetId: 'ev_irregular_blotches',
      symptomKey: 'irregular_blotches',
      confidence: 0.76,
      sourceType: 'visual_admitted',
      currentStatus: 'active'
    }
  ]
  const derivedEvidenceSet = buildDerivedEvidenceSet({
    observedEvidenceSet,
    symptomDictionary: [
      {
        symptomKey: 'brown_spots_halo',
        locationKey: 'leaf',
        patternKey: 'spots',
        distributionKey: 'random'
      },
      {
        symptomKey: 'irregular_blotches',
        locationKey: 'leaf',
        patternKey: 'blotch',
        distributionKey: 'patches'
      }
    ]
  })
  const diagnosisDirections = buildDiagnosisDirections({
    observedEvidenceSet,
    derivedEvidenceSet
  })
  const moldDirection = diagnosisDirections.find(item => item.directionKey === 'mold_direction')

  assert.ok(
    moldDirection,
    'brown_spots_halo / irregular_blotches 这类真实叶斑样证据必须能派生 mold_direction，而不是只在 powder_white 才出现'
  )
  assert.ok(
    moldDirection.matchedPatternKeys.includes('spots') ||
      moldDirection.matchedPatternKeys.includes('blotch'),
    'mold_direction 必须接住真实 batch 中出现的 spots/blotch pattern'
  )
  assert.equal(
    moldDirection.preferredQuestionDimensions[0],
    'surface_residue',
    'mold_direction 首要维度应是表面附着/可擦落，而不是继续泛化视觉确认'
  )

  return {
    name: 'mold_direction_coverage_guard',
    ok: true
  }
}

function checkMoldDirectionFirstRoundFollowUpGuard() {
  assert.ok(
    shouldForceMoldDirectionFirstRoundFollowUp({
      diagnosisDirections: [
        {
          directionKey: 'mold_direction',
          status: 'leading',
          matchedSymptomKeys: ['brown_spots_halo'],
          matchedCandidateSymptomKeys: [],
          matchedPatternKeys: ['spots'],
          tracePayload: {
            matchedCandidatePatternKeys: []
          }
        }
      ],
      followUpHistory: false,
      canAskAnotherFollowUpRound: true
    }),
    'brown_spots_halo / irregular_blotches 这类外观型叶斑证据首轮不应直接收口，必须先触发正交 follow-up'
  )

  return {
    name: 'mold_direction_first_round_followup_guard',
    ok: true
  }
}

function checkCandidateConfirmSecondRoundOrthogonalGuard() {
  assert.ok(
    shouldForceVisualCandidateOrthogonalFollowUp({
      visualAggregateResult: {
        admission_records: [
          {
            admission_result: 'candidate_retained',
            object_key: 'brown_spots_halo',
            candidate: {
              symptom_key: 'brown_spots_halo',
              confidence_band: 'low',
              strength_level: 'weak',
              admission_readiness: 'cautious',
              support_count: 1
            }
          }
        ]
      },
      symptomDictionary: [
        {
          symptomKey: 'brown_spots_halo',
          displayTextCn: '褐斑带黄晕',
          locationKey: 'leaf',
          patternKey: 'spots'
        }
      ],
      observedEvidenceSet: [],
      askedQuestionKeys: ['q_brown_spots_halo_confirm'],
      canAskAnotherFollowUpRound: true
    }),
    'formal candidate confirm 已答但仍无正式证据时，brown_spots 这类候选必须强制转入第二轮正交 follow-up，不能直接落到无关问题'
  )

  return {
    name: 'candidate_confirm_second_round_orthogonal_guard',
    ok: true
  }
}

function checkCrossDirectionVisualCandidateSuppressionGuard() {
  assert.equal(
    shouldSuppressCrossDirectionVisualCandidate(
      {
        symptomKey: 'holes_in_leaf',
        patternKey: 'holes'
      },
      [
        {
          directionKey: 'yellowing_direction',
          matchedSymptomKeys: ['leaf_yellowing'],
          matchedPatternKeys: [],
          matchedCandidateSymptomKeys: [],
          matchedCandidatePatternKeys: []
        },
        {
          directionKey: 'pest_direction',
          matchedSymptomKeys: [],
          matchedPatternKeys: [],
          matchedCandidateSymptomKeys: ['holes_in_leaf'],
          matchedCandidatePatternKeys: ['holes']
        }
      ],
      {
        enabled: true,
        currentClassKey: 'yellowing_mode',
        primaryClass: {
          classKey: 'yellowing_mode',
          classNameCn: '黄叶模式'
        }
      }
    ),
    true,
    '当 symptom class 已锚定黄叶模式时，来自纯 candidate-only 的 pest 方向候选不应越过当前模式进入 follow-up'
  )

  assert.equal(
    shouldSuppressCrossDirectionVisualCandidate(
      {
        symptomKey: 'yellow_speckling',
        patternKey: 'speckling'
      },
      [
        {
          directionKey: 'pest_direction',
          matchedSymptomKeys: ['yellow_speckling'],
          matchedPatternKeys: ['speckling'],
          matchedCandidateSymptomKeys: [],
          matchedCandidatePatternKeys: []
        }
      ],
      {
        enabled: true,
        currentClassKey: 'pest_mode',
        primaryClass: {
          classKey: 'pest_mode',
          classNameCn: '虫害模式'
        }
      }
    ),
    false,
    '如果候选本身已经属于当前已锚定方向，就不应被 cross-direction guard 错杀'
  )

  return {
    name: 'cross_direction_visual_candidate_suppression_guard',
    ok: true
  }
}

function checkSpiderMiteContextGuard() {
  const contextGuard = evaluateContextRequiredProblemGuard({
    rankings: [
      {
        problemKey: 'spider_mites',
        finalScore: 0.92,
        baseScore: 0.92
      }
    ],
    observedEvidenceSet: [
      {
        observedEvidenceSetId: 'ev_yellow_speckling',
        symptomKey: 'yellow_speckling',
        confidence: 0.84,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ]
  })

  assert.equal(
    contextGuard.applies,
    true,
    'spider_mites 必须进入 context-required guard，不能只凭 yellow_speckling 直接收口'
  )
  assert.equal(
    contextGuard.hasRequiredContext,
    false,
    '没有 fine_webbing 等高特异事实时，spider_mites guard 不应视为上下文已满足'
  )
  assert.ok(
    contextGuard.preferredQuestionKeys.includes('q_spider_webbing_visible'),
    'spider_mites guard 必须优先强制蛛网确认题'
  )

  return {
    name: 'spider_mite_context_guard',
    ok: true
  }
}

function checkSpiderMiteOutputEligibilityGuard() {
  const eligible = getOutputEligibleProblemRankings(
    [
      {
        problemKey: 'spider_mites',
        finalScore: 0.92,
        baseScore: 0.92,
        questionEvidence: 0.68,
        visualEvidence: 0
      },
      {
        problemKey: 'fungal_leaf_spot',
        finalScore: 0.58,
        baseScore: 0.58,
        questionEvidence: 0.22,
        visualEvidence: 0.18
      }
    ],
    [
      {
        observedEvidenceSetId: 'ev_yellow_speckling',
        symptomKey: 'yellow_speckling',
        confidence: 0.84,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      },
      {
        observedEvidenceSetId: 'ev_black_spots_spreading',
        symptomKey: 'black_spots_spreading',
        confidence: 0.82,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ],
    new Map([
      ['spider_mites', 'root_cause'],
      ['fungal_leaf_spot', 'root_cause']
    ])
  )

  assert.ok(
    !eligible.some(item => item.problemKey === 'spider_mites'),
    '没有 fine_webbing 等高特异事实时，spider_mites 不应进入 output-eligible pool'
  )
  assert.ok(
    eligible.some(item => item.problemKey === 'fungal_leaf_spot'),
    '非上下文受限的 root_cause 候选应继续保留在 output-eligible pool'
  )

  return {
    name: 'spider_mite_output_eligibility_guard',
    ok: true
  }
}

function checkCandidateOnlyNoForcedContextFollowUpGuard() {
  assert.equal(
    shouldAllowForcedContextProblemFollowUp({
      contextProblemGuard: {
        applies: true,
        hasRequiredContext: false,
        problemKey: 'mealybugs'
      },
      observedEvidenceSet: []
    }),
    false,
    '没有 formal observed evidence 时，candidate-only 排名不能直接触发具体 root_cause 的 forced context follow-up'
  )

  assert.equal(
    shouldAllowForcedContextProblemFollowUp({
      contextProblemGuard: {
        applies: true,
        hasRequiredContext: false,
        problemKey: 'spider_mites'
      },
      observedEvidenceSet: [
        {
          observedEvidenceSetId: 'ev_yellow_speckling',
          symptomKey: 'yellow_speckling',
          confidence: 0.82,
          sourceType: 'visual_admitted',
          currentStatus: 'active'
        }
      ]
    }),
    true,
    '已有 active observed evidence 时，context-required 问题仍可进入 forced context follow-up'
  )

  return {
    name: 'candidate_only_no_forced_context_followup_guard',
    ok: true
  }
}

function checkCandidateOnlyControlledFallbackGuard() {
  assert.equal(
    shouldRestrictToCandidateSeedOnly({
      symptomClassRuntime: {
        enabled: false,
        currentClassKey: '',
        classGateDecision: {
          blockedReason: 'no_observed_symptoms'
        }
      },
      observedEvidenceSet: []
    }),
    true,
    '无 formal observed evidence 且 symptom class 未解析时，generic strategy path 必须关闭，只允许 candidate seed / controlled fallback'
  )

  assert.equal(
    shouldRestrictToCandidateSeedOnly({
      symptomClassRuntime: {
        enabled: true,
        currentClassKey: 'fungal_leaf_spot_mode',
        classGateDecision: {
          blockedReason: ''
        }
      },
      observedEvidenceSet: []
    }),
    false,
    '一旦 class 已解析，不应误把正常 class-gated follow-up 也锁死'
  )

  assert.equal(
    shouldRestrictToCandidateSeedOnly({
      symptomClassRuntime: {
        enabled: false,
        currentClassKey: '',
        classGateDecision: {
          blockedReason: 'no_observed_symptoms'
        }
      },
      observedEvidenceSet: [
        {
          observedEvidenceSetId: 'ev_brown_spots_halo',
          symptomKey: 'brown_spots_halo',
          confidence: 0.83,
          sourceType: 'visual_admitted',
          currentStatus: 'active'
        }
      ]
    }),
    false,
    '已有 active observed evidence 后，不应继续停留在 candidate-only fallback 锁定态'
  )

  return {
    name: 'candidate_only_controlled_fallback_guard',
    ok: true
  }
}

function checkFollowUpRoundLimitSemanticsGuard() {
  assert.equal(
    canOpenNextFollowUpRound(1),
    true,
    '初诊轮结束后应允许进入第 1 轮人工问答'
  )

  assert.equal(
    canOpenNextFollowUpRound(2),
    true,
    '已完成 1 轮人工问答后，一页一题模式仍应允许继续问答'
  )

  assert.equal(
    canOpenNextFollowUpRound(3),
    true,
    '一页一题模式下不再用旧的 2 轮上限截断追问'
  )

  assert.equal(
    canOpenNextFollowUpRound(8),
    true,
    '黄叶等低特异模式需要按分流 gate 决定是否继续，而不是按固定轮数停止'
  )

  return {
    name: 'followup_round_unlimited_semantics_guard',
    ok: true
  }
}

function checkYellowingSecondRoundProbeGuard() {
  const selected = selectFollowUpQuestions({
    rankings: [
      {
        problemKey: 'iron_deficiency',
        finalScore: 0.74,
        baseScore: 0.74
      }
    ],
    strategies: [
      {
        problemKey: 'iron_deficiency',
        questionKey: 'q_leaf_yellowing_fertilization_background',
        questionGroupKey: 'yellowing_fertilization_background_group',
        priorityScore: 96,
        reviewStatus: 'audited'
      },
      {
        problemKey: 'iron_deficiency',
        questionKey: 'q_leaf_yellowing_new_growth_bias',
        questionGroupKey: 'leaf_yellowing_group',
        priorityScore: 92,
        reviewStatus: 'audited'
      }
    ],
    questions: [
      {
        questionKey: 'q_leaf_yellowing_fertilization_background',
        questionTextUserCn: '最近是否长期停肥、换盆后迟迟没恢复供肥，或整个生长期几乎没补过肥？',
        targetSymptomKey: 'leaf_yellowing',
        questionGroupKey: 'yellowing_fertilization_background_group',
        targetDimension: 'fertilization_context',
        routingScope: 'context_probe',
        reviewStatus: 'audited'
      },
      {
        questionKey: 'q_leaf_yellowing_new_growth_bias',
        questionTextUserCn: '发黄主要出现在新叶，而老叶相对更绿吗？',
        targetSymptomKey: 'yellow_new_leaves',
        questionGroupKey: 'leaf_yellowing_group',
        targetDimension: 'host_confirmation',
        routingScope: 'context_probe',
        reviewStatus: 'audited'
      }
    ],
    optionMappings: [
      {
        questionKey: 'q_leaf_yellowing_new_growth_bias',
        optionKey: 'yes',
        optionTextUserCn: '是，比较确定'
      },
      {
        questionKey: 'q_leaf_yellowing_new_growth_bias',
        optionKey: 'no',
        optionTextUserCn: '否，基本没有'
      },
      {
        questionKey: 'q_leaf_yellowing_new_growth_bias',
        optionKey: 'unknown',
        optionTextUserCn: '看不出/不确定'
      }
    ],
    observedSymptoms: [
      {
        symptomKey: 'leaf_yellowing',
        confidence: 0.93,
        signalReliability: 0.88,
        locationKey: 'leaf',
        patternKey: 'chlorosis',
        distributionKey: ''
      }
    ],
    observedEvidenceSet: [
      {
        observedEvidenceSetId: 'ev_leaf_yellowing',
        symptomKey: 'leaf_yellowing',
        confidence: 0.93,
        signalReliability: 0.88,
        sourceType: 'visual_admitted',
        currentStatus: 'active'
      }
    ],
    askedQuestions: [
      {
        questionKey: 'q_leaf_yellowing_light_background',
        questionGroupKey: 'yellowing_light_background_group',
        targetSymptomKey: 'leaf_yellowing',
        targetDimension: 'light_exposure'
      },
      {
        questionKey: 'q_leaf_yellowing_watering_background',
        questionGroupKey: 'yellowing_watering_background_group',
        targetSymptomKey: 'leaf_yellowing',
        targetDimension: 'watering_context'
      },
      {
        questionKey: 'q_leaf_yellowing_fertilization_background',
        questionGroupKey: 'yellowing_fertilization_background_group',
        targetSymptomKey: 'leaf_yellowing',
        targetDimension: 'fertilization_context'
      }
    ],
    symptomDictionary: [
      {
        symptomKey: 'leaf_yellowing',
        locationKey: 'leaf',
        patternKey: 'chlorosis',
        distributionKey: ''
      },
      {
        symptomKey: 'yellow_new_leaves',
        locationKey: 'leaf',
        patternKey: 'chlorosis',
        distributionKey: 'new_growth'
      }
    ],
    askedQuestionKeys: [
      'q_leaf_yellowing_light_background',
      'q_leaf_yellowing_watering_background',
      'q_leaf_yellowing_fertilization_background'
    ],
    answeredQuestionGroupKeys: [
      'yellowing_light_background_group',
      'yellowing_watering_background_group',
      'yellowing_fertilization_background_group'
    ],
    unknownCountByGroup: {
      yellowing_light_background_group: 0,
      yellowing_watering_background_group: 0,
      yellowing_fertilization_background_group: 1
    },
    symptomClassRuntime: {
      enabled: true,
      currentClassKey: 'yellowing_mode',
      classGateDecision: {
        blockedReason: ''
      }
    },
    maxQuestions: 1
  })

  assert.deepEqual(
    selected.map(item => item.questionKey),
    ['q_leaf_yellowing_new_growth_bias'],
    '黄叶路径在首轮环境背景题答完后，第 2 轮仍应能继续追问“新叶更黄”这类高价值分流题'
  )

  return {
    name: 'yellowing_second_round_probe_guard',
    ok: true
  }
}

async function checkYellowingSyntheticFollowUpDimensionPersistenceGuard() {
  const firstGate = await diagnosisEngineTestHooks.buildYellowingGateFollowUps({
    rankings: [{ problemKey: 'nitrogen_deficiency', finalScore: 0.26 }],
    observedSymptoms: [{ symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' }],
    observedEvidenceSet: [{ symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' }],
    askedQuestions: [],
    symptomClassRuntime: {
      enabled: true,
      currentClassKey: 'yellowing_mode'
    }
  })
  assert.equal(
    firstGate[0]?.targetDimension,
    'watering_frequency_context',
    '黄叶模式必须先按分组 gate 问浇水频率，不能聚合全部 gate options 或回到旧首要线索 gate'
  )
  assert.equal(firstGate.length, 1, '黄叶分组 gate 每轮只能返回一组问题')
  assert.ok(
    (
      String(firstGate[0]?.questionText || '').includes('浇水') ||
      String(firstGate[0]?.helpText || '').includes('浇水') ||
      (Array.isArray(firstGate[0]?.options) ? firstGate[0].options : []).some(option =>
        String(option.text || '').includes('湿') || String(option.description || '').includes('浇水')
      )
    ) &&
      !String(firstGate[0]?.questionText || '').includes('原因较复杂'),
    '黄叶第一组题必须是具体浇水上下文，不再展示旧分流说明题干'
  )

  const wateringRows = diagnosisEngineTestHooks.mergeAskedQuestionRows(
    diagnosisEngineTestHooks.collectAnswerLikeRecordsFromFollowUpRows([
      {
        asked: 1,
        answer_value: 'often_wet',
        status: 'answered',
        symptom_key: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        rationale: JSON.stringify({
          qk: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          qg: 'observed_probe__leaf_yellowing__watering_frequency_context',
          tsk: 'leaf_yellowing',
          td: 'watering_frequency_context',
          rs: 'context_probe',
          r: 1
        })
      }
    ])
  )
  const lightGate = await diagnosisEngineTestHooks.buildYellowingGateFollowUps({
    rankings: [{ problemKey: 'nitrogen_deficiency', finalScore: 0.26 }],
    observedSymptoms: [{ symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' }],
    observedEvidenceSet: [{ symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' }],
    askedQuestions: wateringRows,
    symptomClassRuntime: {
      enabled: true,
      currentClassKey: 'yellowing_mode'
    }
  })
  assert.equal(
    lightGate[0]?.targetDimension,
    'light_change_context',
    '黄叶回答浇水组后，下一页必须进入光照变化组'
  )
  assert.equal(lightGate.length, 1, '黄叶光照组也只能返回一组问题')

  const fertilizationRows = diagnosisEngineTestHooks.mergeAskedQuestionRows(
    diagnosisEngineTestHooks.collectAnswerLikeRecordsFromFollowUpRows([
      {
        asked: 1,
        answer_value: 'often_wet',
        status: 'answered',
        symptom_key: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        rationale: JSON.stringify({
          qk: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          tsk: 'leaf_yellowing',
          td: 'watering_frequency_context',
          rs: 'context_probe',
          r: 1
        })
      },
      {
        asked: 1,
        answer_value: 'no_clear_change',
        status: 'answered',
        symptom_key: 'q_observed_probe__leaf_yellowing__light_change_context',
        rationale: JSON.stringify({
          qk: 'q_observed_probe__leaf_yellowing__light_change_context',
          tsk: 'leaf_yellowing',
          td: 'light_change_context',
          rs: 'context_probe',
          r: 2
        })
      }
    ])
  )
  const fertilizationGate = await diagnosisEngineTestHooks.buildYellowingGateFollowUps({
    rankings: [{ problemKey: 'nitrogen_deficiency', finalScore: 0.26 }],
    observedSymptoms: [{ symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' }],
    observedEvidenceSet: [{ symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' }],
    askedQuestions: fertilizationRows,
    symptomClassRuntime: {
      enabled: true,
      currentClassKey: 'yellowing_mode'
    }
  })
  assert.equal(
    fertilizationGate[0]?.targetDimension,
    'fertilization_growth_context',
    '黄叶回答浇水和光照后，下一页必须进入施肥/长势组'
  )
  assert.equal(fertilizationGate.length, 1, '黄叶施肥/长势组也只能返回一组问题')

  const wateringAnsweredRows = diagnosisEngineTestHooks.mergeAskedQuestionRows([
    ...wateringRows,
  ])
  assert.ok(
    diagnosisEngineTestHooks.isYellowingEquivalentDimensionAnswered(wateringAnsweredRows, {
      targetSymptomKey: 'leaf_yellowing',
      targetDimension: QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT
    }),
    '已回答 watering_frequency_context 后，旧静态 watering_context 必须被等价维度去重'
  )

  const progressionRows = diagnosisEngineTestHooks.mergeAskedQuestionRows(
    diagnosisEngineTestHooks.collectAnswerLikeRecordsFromFollowUpRows([
      {
        asked: 1,
        answer_value: 'often_wet',
        status: 'answered',
        symptom_key: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        rationale: JSON.stringify({
          qk: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          qg: 'observed_probe__leaf_yellowing__watering_frequency_context',
          tsk: 'leaf_yellowing',
          td: 'watering_frequency_context',
          rs: 'context_probe',
          r: 1
        })
      },
      {
        asked: 1,
        answer_value: 'no_clear_change',
        status: 'answered',
        symptom_key: 'q_observed_probe__leaf_yellowing__light_change_context',
        rationale: JSON.stringify({
          qk: 'q_observed_probe__leaf_yellowing__light_change_context',
          qg: 'observed_probe__leaf_yellowing__light_change_context',
          tsk: 'leaf_yellowing',
          td: 'light_change_context',
          r: 2
        })
      },
      {
        asked: 1,
        answer_value: 'normal_light_fertilizer',
        status: 'answered',
        symptom_key: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
        rationale: JSON.stringify({
          qk: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
          qg: 'observed_probe__leaf_yellowing__fertilization_growth_context',
          tsk: 'leaf_yellowing',
          td: 'fertilization_growth_context',
          r: 3
        })
      }
    ])
  )
  const progressionGate = await diagnosisEngineTestHooks.buildYellowingGateFollowUps({
    rankings: [{ problemKey: 'nitrogen_deficiency', finalScore: 0.26 }],
    observedSymptoms: [{ symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' }],
    observedEvidenceSet: [{ symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' }],
    askedQuestions: progressionRows,
    symptomClassRuntime: {
      enabled: true,
      currentClassKey: 'yellowing_mode'
    }
  })

  assert.equal(
    progressionGate[0]?.targetDimension,
    'yellowing_progression_speed',
    '黄叶回答前三组后，下一页必须进入发展速度组'
  )
  assert.equal(progressionGate.length, 1, '黄叶发展速度组也只能返回一组问题')

  return {
    name: 'yellowing_synthetic_followup_dimension_persistence_guard',
    ok: true
  }
}

  const checks = [
    checkPromptLocationPoolGuard(),
    checkPromptCommonSenseGuard(),
    checkObservedMorphologyPriorityGuard(),
    checkExplicitObservedVisualPresenceBlockGuard(),
    checkSyntheticObservedProbeGuard(),
    checkObservedContextDimensionDiversityGuard(),
    checkSyntheticObservedProbeScoringGuard(),
    checkPestSpecklingObservedProbeGuard(),
    checkPestSpecklingDirectionManagedVisualPresenceGuard(),
    checkExplicitObservedSymptomGuard(),
    checkStemSoftnessSyntheticScoringGuard(),
    checkContextRequiredProblemGuard(),
    checkHighSpecificityFastConvergenceGuard(),
    checkEvidenceSourceIsolationGuard(),
    checkCorroboratedConvergenceGuard(),
    checkFormalUncertainGuard(),
    checkDecisionCausePropagationGuard(),
    checkDerivedEvidenceAndCareBaselineGuard(),
    checkDiagnosisDirectionsGuard(),
    checkHealthyDirectionGuard(),
    checkChewingDirectionGuard(),
    checkChewingVisualCandidateSeedGuard(),
    checkStructuralOutOfPoolHintSeedGuard(),
    checkMoldOutOfPoolHintSeedGuard(),
    checkMoldDirectionCoverageGuard(),
    checkMoldDirectionFirstRoundFollowUpGuard(),
    checkCandidateConfirmSecondRoundOrthogonalGuard(),
    checkCrossDirectionVisualCandidateSuppressionGuard(),
    checkSpiderMiteContextGuard(),
    checkSpiderMiteOutputEligibilityGuard(),
    checkCandidateOnlyNoForcedContextFollowUpGuard(),
    checkCandidateOnlyControlledFallbackGuard(),
    checkFollowUpRoundLimitSemanticsGuard(),
    checkYellowingSecondRoundProbeGuard(),
    await checkYellowingSyntheticFollowUpDimensionPersistenceGuard()
  ]

console.log(JSON.stringify({ ok: true, checks }, null, 2))
