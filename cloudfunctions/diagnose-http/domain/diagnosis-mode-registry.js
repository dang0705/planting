'use strict'

const PEST_CATEGORY = 'pest'

const PEST_MODE_KEYS = Object.freeze([
  'spider_mite',
  'mealybug',
  'scale_insect',
  'whitefly',
  'aphid',
  'thrips',
  'leaf_miner',
  'fungus_gnat'
])

const PEST_MODE_DISPLAY_NAMES = Object.freeze({
  spider_mite: '红蜘蛛（叶螨）',
  mealybug: '白色棉粉虫（粉蚧）',
  scale_insect: '小硬壳虫（介壳虫）',
  whitefly: '白色小飞虫（白粉虱）',
  aphid: '成群小软虫（蚜虫）',
  thrips: '蓟马',
  leaf_miner: '叶子里的潜道虫',
  fungus_gnat: '盆土小黑飞（蕈蚊）'
})

const FORMAL_PEST_VISUAL_EVIDENCE_KEYS = Object.freeze([
  'visible_mite_colony',
  'fine_webbing',
  'yellow_speckling',
  'visible_mealybug_colony',
  'scale_shells',
  'white_flies',
  'fixed_oval_nymphs',
  'aphids_visible',
  'thrips_visible',
  'silver_scarring',
  'black_fecal_spots',
  'tunnels_in_leaf',
  'small_flies_soil',
  'wet_soil_surface',
  'surface_glossy_residue',
  'sooty_mold'
])

const GENERAL_VISUAL_EVIDENCE_KEYS = Object.freeze([
  'leaf_yellowing',
  'yellowing_patchy',
  'leaf_droop',
  'powder_white',
  'sooty_mold'
])

function createModeRegistryEntry({
  modeKey,
  category = 'general',
  userDisplayName,
  requiresAiInitialAssessment = false,
  manualDirectEntryEnabled = true,
  allowedProfiles = ['full'],
  questionPackageKind,
  maxQuestions,
  allowsMultipleResults = true,
  enabled = true,
  pendingImplementation = false
}) {
  return Object.freeze({
    modeKey,
    category,
    userDisplayName,
    requiresAiInitialAssessment,
    manualDirectEntryEnabled,
    allowedProfiles,
    questionPackageKind,
    maxQuestions,
    allowsMultipleResults,
    enabled,
    pendingImplementation
  })
}

const DIAGNOSIS_MODE_REGISTRY = Object.freeze({
  yellow_leaf: createModeRegistryEntry({
    modeKey: 'yellow_leaf',
    userDisplayName: '叶片发黄',
    questionPackageKind: 'fixed_yellow_leaf',
    maxQuestions: 4
  }),
  wilting_droop: createModeRegistryEntry({
    modeKey: 'wilting_droop',
    userDisplayName: '发蔫或下垂',
    questionPackageKind: 'fixed_wilting_droop',
    maxQuestions: 5
  }),
  powdery_mildew: createModeRegistryEntry({
    modeKey: 'powdery_mildew',
    userDisplayName: '白粉病',
    requiresAiInitialAssessment: true,
    manualDirectEntryEnabled: false,
    allowedProfiles: ['full'],
    questionPackageKind: 'visual_direct_only',
    maxQuestions: 0
  }),
  sooty_mold: createModeRegistryEntry({
    modeKey: 'sooty_mold',
    userDisplayName: '煤污病（霉菌）',
    requiresAiInitialAssessment: true,
    manualDirectEntryEnabled: false,
    allowedProfiles: ['full'],
    questionPackageKind: 'visual_direct_only',
    maxQuestions: 0
  }),
  root_rot: createModeRegistryEntry({
    modeKey: 'root_rot',
    userDisplayName: '根腐诊断',
    questionPackageKind: 'fixed_root_rot',
    maxQuestions: 0,
    enabled: false,
    pendingImplementation: true
  }),
  ...Object.fromEntries(
    PEST_MODE_KEYS.map(modeKey => [
      modeKey,
      createModeRegistryEntry({
        modeKey,
        category: PEST_CATEGORY,
        userDisplayName: PEST_MODE_DISPLAY_NAMES[modeKey],
        requiresAiInitialAssessment: true,
        manualDirectEntryEnabled: false,
        allowedProfiles: ['full', 'pest'],
        questionPackageKind: 'dynamic_specific_pest',
        maxQuestions: 2
      })
    ])
  )
})

function createVisualRule({ modeKey, organKeys, evidence, visibleAnomalies = [] }) {
  return Object.freeze({
    modeKey,
    organKeys: Object.freeze([...organKeys]),
    evidence: Object.freeze(
      evidence.map(item =>
        Object.freeze({
          evidenceKey: item.evidenceKey
        })
      )
    ),
    visibleAnomalies: Object.freeze(
      visibleAnomalies.map(item =>
        Object.freeze({
          evidenceKey: item.evidenceKey,
          description: item.description
        })
      )
    )
  })
}

const PEST_VISUAL_RULES = Object.freeze([
  createVisualRule({
    modeKey: 'spider_mite',
    organKeys: ['leaf', 'stem'],
    evidence: [
      { evidenceKey: 'visible_mite_colony' },
      { evidenceKey: 'fine_webbing' },
      { evidenceKey: 'yellow_speckling' }
    ],
    visibleAnomalies: [
      { evidenceKey: 'fine_webbing', description: '叶片或茎部可见细网' },
      { evidenceKey: 'yellow_speckling', description: '叶片点状白黄伤痕' }
    ]
  }),
  createVisualRule({
    modeKey: 'mealybug',
    organKeys: ['leaf', 'stem'],
    evidence: [
      { evidenceKey: 'visible_mealybug_colony' },
      { evidenceKey: 'surface_glossy_residue' },
      { evidenceKey: 'sooty_mold' }
    ],
    visibleAnomalies: [
      {
        evidenceKey: 'surface_glossy_residue',
        description: '叶片或茎部表面可见发亮、近透明滴状或薄膜残留'
      },
      { evidenceKey: 'sooty_mold', description: '叶片或茎部可见黑色霉膜' }
    ]
  }),
  createVisualRule({
    modeKey: 'scale_insect',
    organKeys: ['leaf', 'stem'],
    evidence: [
      { evidenceKey: 'scale_shells' },
      { evidenceKey: 'surface_glossy_residue' },
      { evidenceKey: 'sooty_mold' }
    ],
    visibleAnomalies: [
      {
        evidenceKey: 'surface_glossy_residue',
        description: '叶片或茎部表面可见发亮、近透明滴状或薄膜残留'
      },
      { evidenceKey: 'sooty_mold', description: '叶片或茎部可见黑色霉膜' }
    ]
  }),
  createVisualRule({
    modeKey: 'whitefly',
    organKeys: ['leaf'],
    evidence: [
      { evidenceKey: 'white_flies' },
      { evidenceKey: 'fixed_oval_nymphs' },
      { evidenceKey: 'surface_glossy_residue' },
      { evidenceKey: 'sooty_mold' }
    ],
    visibleAnomalies: [
      {
        evidenceKey: 'surface_glossy_residue',
        description: '叶片或茎部表面可见发亮、近透明滴状或薄膜残留'
      },
      { evidenceKey: 'sooty_mold', description: '叶片或茎部可见黑色霉膜' }
    ]
  }),
  createVisualRule({
    modeKey: 'aphid',
    organKeys: ['leaf', 'stem'],
    evidence: [{ evidenceKey: 'aphids_visible' }, { evidenceKey: 'surface_glossy_residue' }],
    visibleAnomalies: [
      {
        evidenceKey: 'surface_glossy_residue',
        description: '叶片或茎部表面可见发亮、近透明滴状或薄膜残留'
      }
    ]
  }),
  createVisualRule({
    modeKey: 'thrips',
    organKeys: ['leaf', 'flower'],
    evidence: [
      { evidenceKey: 'thrips_visible' },
      { evidenceKey: 'silver_scarring' },
      { evidenceKey: 'black_fecal_spots' },
      { evidenceKey: 'yellow_speckling' }
    ],
    visibleAnomalies: [
      { evidenceKey: 'silver_scarring', description: '同区银白擦伤' },
      { evidenceKey: 'black_fecal_spots', description: '同区针尖黑点/短线' },
      { evidenceKey: 'yellow_speckling', description: '叶片点状白黄伤痕' }
    ]
  }),
  createVisualRule({
    modeKey: 'leaf_miner',
    organKeys: ['leaf'],
    evidence: [{ evidenceKey: 'tunnels_in_leaf' }],
    visibleAnomalies: [{ evidenceKey: 'tunnels_in_leaf', description: '叶内潜道' }]
  }),
  createVisualRule({
    modeKey: 'fungus_gnat',
    organKeys: ['soil'],
    evidence: [{ evidenceKey: 'small_flies_soil' }, { evidenceKey: 'wet_soil_surface' }],
    visibleAnomalies: [{ evidenceKey: 'wet_soil_surface', description: '盆土表面潮湿' }]
  })
])

const GENERAL_VISUAL_RULES = Object.freeze([
  createVisualRule({
    modeKey: 'yellow_leaf',
    organKeys: ['leaf'],
    evidence: [{ evidenceKey: 'leaf_yellowing' }, { evidenceKey: 'yellowing_patchy' }],
    visibleAnomalies: [
      { evidenceKey: 'leaf_yellowing', description: '叶片均匀黄化' },
      { evidenceKey: 'yellowing_patchy', description: '叶片斑状黄化' }
    ]
  }),
  createVisualRule({
    modeKey: 'wilting_droop',
    organKeys: ['leaf', 'whole_plant'],
    evidence: [{ evidenceKey: 'leaf_droop' }],
    visibleAnomalies: [
      { evidenceKey: 'leaf_droop', description: '叶片整体下垂偏离正常着生角度' }
    ]
  }),
  createVisualRule({
    modeKey: 'powdery_mildew',
    organKeys: ['leaf', 'stem'],
    evidence: [{ evidenceKey: 'powder_white' }],
    visibleAnomalies: [
      { evidenceKey: 'powder_white', description: '叶片或茎部表面白色粉状附着物' }
    ]
  }),
  createVisualRule({
    modeKey: 'sooty_mold',
    organKeys: ['leaf', 'stem'],
    evidence: [{ evidenceKey: 'sooty_mold' }],
    visibleAnomalies: [
      { evidenceKey: 'sooty_mold', description: '叶片或茎部表面黑色绒状或薄膜状霉层' }
    ]
  })
])

const PEST_EVIDENCE_RULES = Object.freeze({
  yellow_leaf: Object.freeze({
    directGroups: [['leaf_yellowing'], ['yellowing_patchy']],
    candidateGroups: [['leaf_yellowing'], ['yellowing_patchy']],
    indirectGroups: [],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  wilting_droop: Object.freeze({
    directGroups: [['leaf_droop']],
    candidateGroups: [['leaf_droop']],
    indirectGroups: [],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  spider_mite: Object.freeze({
    directGroups: [['visible_mite_colony']],
    candidateGroups: [['visible_mite_colony'], ['fine_webbing']],
    indirectGroups: [['fine_webbing'], ['yellow_speckling', 'stippling']],
    allowIndirectDirect: true,
    directCombinationGroups: [[['fine_webbing'], ['yellow_speckling', 'stippling']]]
  }),
  mealybug: Object.freeze({
    directGroups: [['visible_mealybug_colony']],
    candidateGroups: [['visible_mealybug_colony']],
    indirectGroups: [['surface_glossy_residue'], ['sooty_mold']],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  scale_insect: Object.freeze({
    directGroups: [['scale_shells']],
    candidateGroups: [['scale_shells']],
    indirectGroups: [['surface_glossy_residue'], ['sooty_mold']],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  whitefly: Object.freeze({
    directGroups: [],
    candidateGroups: [['white_flies'], ['fixed_oval_nymphs']],
    indirectGroups: [
      ['white_flies'],
      ['fixed_oval_nymphs'],
      ['surface_glossy_residue'],
      ['sooty_mold']
    ],
    allowIndirectDirect: true,
    directCombinationGroups: [[['white_flies'], ['fixed_oval_nymphs']]]
  }),
  aphid: Object.freeze({
    directGroups: [['aphids_visible']],
    candidateGroups: [['aphids_visible']],
    indirectGroups: [['surface_glossy_residue']],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  thrips: Object.freeze({
    directGroups: [['thrips_visible']],
    candidateGroups: [
      ['thrips_visible'],
      ['silver_scarring', 'silver_streaks'],
      ['black_fecal_spots']
    ],
    indirectGroups: [
      ['silver_scarring', 'silver_streaks'],
      ['black_fecal_spots'],
      ['yellow_speckling', 'stippling']
    ],
    allowIndirectDirect: true,
    directCombinationGroups: [[['silver_scarring', 'silver_streaks'], ['black_fecal_spots']]]
  }),
  leaf_miner: Object.freeze({
    directGroups: [['tunnels_in_leaf']],
    candidateGroups: [['tunnels_in_leaf']],
    indirectGroups: [],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  fungus_gnat: Object.freeze({
    directGroups: [['small_flies_soil']],
    candidateGroups: [['small_flies_soil']],
    indirectGroups: [['wet_soil_surface']],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  powdery_mildew: Object.freeze({
    directGroups: [['powder_white']],
    candidateGroups: [['powder_white']],
    indirectGroups: [],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  sooty_mold: Object.freeze({
    directGroups: [['sooty_mold']],
    candidateGroups: [['sooty_mold']],
    indirectGroups: [],
    allowIndirectDirect: false,
    directCombinationGroups: []
  }),
  root_rot: Object.freeze({
    directGroups: [],
    candidateGroups: [],
    indirectGroups: [],
    allowIndirectDirect: false,
    directCombinationGroups: []
  })
})

const GENERIC_EVIDENCE_GROUP_KEYS = Object.freeze(
  new Set([
    'fine_webbing',
    'yellow_speckling',
    'surface_glossy_residue',
    'sooty_mold',
    'white_flies',
    'fixed_oval_nymphs',
    'silver_scarring',
    'black_fecal_spots',
    'wet_soil_surface'
  ])
)

const LOCKED_SPECIFIC_PEST_MODES = Object.freeze(PEST_MODE_KEYS.slice())

module.exports = {
  DIAGNOSIS_MODE_REGISTRY,
  FORMAL_PEST_VISUAL_EVIDENCE_KEYS,
  GENERAL_VISUAL_EVIDENCE_KEYS,
  GENERAL_VISUAL_RULES,
  GENERIC_EVIDENCE_GROUP_KEYS,
  LOCKED_SPECIFIC_PEST_MODES,
  PEST_CATEGORY,
  PEST_EVIDENCE_RULES,
  PEST_MODE_DISPLAY_NAMES,
  PEST_MODE_KEYS,
  PEST_VISUAL_RULES
}
