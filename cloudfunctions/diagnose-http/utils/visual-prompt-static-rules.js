'use strict'

const crypto = require('crypto')

const { ALLOWED_CAPTURE_REGIONS } = require('./capture-region-normalizer')
const {
  FORMAL_PEST_VISUAL_EVIDENCE_KEYS,
  GENERAL_VISUAL_RULES,
  PEST_EVIDENCE_RULES,
  PEST_VISUAL_RULES
} = require('../domain/diagnosis-mode-registry')

const FULL_CASE_LOCATION_KEYS = ['leaf', 'stem', 'flower', 'soil', 'root', 'plant', 'whole_plant']

const LOCATION_LABEL_MAP = {
  leaf: '叶片',
  stem: '茎部',
  flower: '花部',
  soil: '盆土 / 根际',
  root: '根部',
  plant: '整株',
  whole_plant: '整株'
}

const BASE_PROMPT_SYMPTOM_HINTS = {
  holes_in_leaf: '穿透洞/缺损',
  chewed_edges: '叶缘缺口',
  skeletonized_leaves: '只剩叶脉',
  tunnels_in_leaf: '蛇形潜道',
  black_spots_spreading: '完整组织黑斑',
  brown_spots_halo: '褐斑黄晕',
  irregular_blotches: '不规则暗斑'
}

const PROMPT_SYMPTOM_HINTS = Object.freeze({
  ...BASE_PROMPT_SYMPTOM_HINTS,
  ...Object.fromEntries(FORMAL_PEST_VISUAL_EVIDENCE_KEYS.map(key => [key, key]))
})

// 动态区只补短的可视化释义，帮助模型把机器键映射到画面；不改变固定缓存前缀。
// 这些是观察提示，不是强制输出条件，避免为了省 token 把证据键变成无意义的黑箱。
const PEST_VISUAL_EVIDENCE_HINTS = Object.freeze({
  visible_mite_colony: '可分辨螨群',
  fine_webbing: '细密蛛网状丝线',
  yellow_speckling: '密集黄白小点',
  visible_mealybug_colony: '白色棉絮虫团',
  scale_shells: '固定扁圆硬壳虫体',
  white_flies: '白色小飞虫',
  fixed_oval_nymphs: '固定椭圆若虫',
  aphids_visible: '成群小软虫',
  thrips_visible: '细长小虫体',
  silver_scarring: '银灰擦痕',
  black_fecal_spots: '银灰区针尖黑点',
  tunnels_in_leaf: '叶肉内连续蛇形潜道',
  small_flies_soil: '土表小黑飞',
  wet_soil_surface: '土表明显湿润',
  surface_glossy_residue: '发亮薄膜或滴状残留',
  sooty_mold: '黑色霉膜'
})

const STATIC_ROUTE_CATALOG_TEXT = [
  '【全局词典】',
  'normalized_organ=leaf|stem|flower|root|root_crown|soil|whole_plant|fruit|other|unknown；capture_region/region_ref=' +
    ALLOWED_CAPTURE_REGIONS.join('|') +
    '。',
  'mode_candidates=yellow_leaf|wilting_droop|powdery_mildew|sooty_mold|spider_mite|mealybug|scale_insect|whitefly|aphid|thrips|leaf_miner|fungus_gnat。',
  'pest 模式=spider_mite|mealybug|scale_insect|whitefly|aphid|thrips|leaf_miner|fungus_gnat。',
  '虫害可见证据键=' + FORMAL_PEST_VISUAL_EVIDENCE_KEYS.join('|') + '。'
].join('\n')

const STATIC_VISUAL_WORKFLOW_BASE_RULES = [
  '【工作流程】',
  '1. 逐图只标当前画面可复核的对象、位置和形态；不推断触感、气味、遮挡、历史、病因、治疗或最终状态。',
  '2. 器官、症状、模式和证据都按像素判断；不可从槽位、键名、文字或前序结论反推。器官不清楚填 unknown。',
  '3. 只输出能支持路由的正向或不确定观察；未见、空项或普通否定不填，不用 absent/none 凑数组。',
  '4. 多图由服务端汇总；本图观察不能冒充另一张图。',
  '【输出规则】',
  '1. 只返回 JSON，不得输出 confirmed、final_outcome_key、diagnosis_key、treatment_plan、解释或 Markdown。',
  '2. capture_region/region_ref 只写当前图；mode 是当前图候选，symptom 只可使用动态区允许键。',
  '3. 上限：mode 3、symptom 3、池外 1、visual_discriminator 2；空数组可省略。',
  '4. confidence 只表示当前图可见把握，不等于病因、因果或治疗。'
].join('\n')

const STATIC_READING_DISCIPLINE_TEXT = [
  '【判读纪律】',
  '1. 先核对对象、位置、形态、颜色/质地、分布和清晰度；关键要素缺失就降低把握，不用常识补全。',
  '2. 虫体必须有可辨认、能与背景分离的实体；啃食、排泄物、网丝、残留或受害纹理不能等同看见虫体。',
  '3. 叶内潜道须有叶肉内连续轨迹；擦伤、斑驳、阴影、折痕或叶脉不能替代。',
  '4. 霉层/粉层必须有可见附着物的边界、质地和范围；组织变色、反光或水渍不算附着。',
  '5. 噪点、压缩块、灰尘、土屑、水珠、失焦和背景纹理不能直接升级为虫体或病原结构。',
  '6. 位置、证据、候选和把握必须能在同一画面追溯；不能排除阴影、反光或遮挡时保守。',
  '7. surface_glossy_residue 仅在图片明确可见且位于允许器官时记录；不确定时省略。',
  '8. 只写短的 visible_basis_cn，描述可见形态和位置，不重复同义候选。',
  '9. 先判断主体是否真的出现在画面中，再判断异常；没有拍到的部位记为未见，不写不存在或已排除。',
  '10. 叶片、叶背、叶缘、叶脉、叶柄、茎、花、果、根和土表是不同位置；位置不清楚时使用 unknown，不用器官槽位补全。',
  '11. 同一异常只保留一个最准确的 symptom_key；不要把颜色、形态、位置和病因拆成多个重复候选。',
  '12. symptom_candidates 只写当前图能直接支持的短列表；候选之间互相矛盾时降低 confidence_band，并在 normalization_notes 简短说明。',
  '13. mode_candidates 只表示当前图可见模式线索；不要因为模式名称熟悉、器官提示或症状键存在就强行输出模式。',
  '14. 虫害模式必须有对应的虫体、叶内潜道、表面附着物或明确受害结构；单独黄化、斑驳、下垂、湿润或反光不能升级为虫害模式。',
  '15. 叶片黄化要区分均匀、叶脉间、斑驳和局部坏死；仅凭颜色相近不能补写营养、浇水、光照或病原原因。',
  '16. 下垂要有当前图可见的姿态变化；叶片较大、角度倾斜、拍摄透视或枝条弯曲不能单独作为 wilting_droop 依据。',
  '17. 土表只记录表面可见的颜色、颗粒、湿痕、积水、霉层或实体；不能从土表推断盆内根系、长期水分或根腐。',
  '18. 根部只记录清晰可见的根、根冠和附着物；盆壁、土粒、阴影或线条不清楚时不能命名为根部病变。',
  '19. 证据键、region_ref、capture_region 和 normalized_organ 必须互相一致；无法保持一致时保留最保守的可见事实。',
  '20. 图片质量影响把握：失焦、遮挡、过曝、欠曝、反光、压缩或目标太小都要降低 confidence，不得用常识补齐缺失细节。',
  '21. 每个 visual_discriminator 只写一个维度和一个值；visible_basis_cn 只解释该值的可见依据，不重复 symptom_candidates。',
  '22. missing_info_for_path 只列出会阻断当前判断的缺失信息；若现有画面已能支持路由，不要制造额外追问。',
  '23. suggested_question_capture 只建议能直接补足当前图缺口的拍摄区域；不要建议重新上传同一视角，也不要输出治疗建议。',
  '24. 输出前删除普通背景、重复键、空对象和无法复核的推断；JSON 必须简短、合法、字段类型正确，不能夹带说明文字。'
].join('\n')

const STATIC_VISUAL_WORKFLOW_RULES = [
  STATIC_VISUAL_WORKFLOW_BASE_RULES,
  STATIC_READING_DISCIPLINE_TEXT
].join('\n')

function compilePestVisualMapping(locationKeys = []) {
  const normalizedLocationKeys = new Set(
    (Array.isArray(locationKeys) ? locationKeys : [])
      .map(value =>
        String(value || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  )
  if (!normalizedLocationKeys.size) {
    return ''
  }

  const mappings = PEST_VISUAL_RULES.filter(rule =>
    rule.organKeys.some(organKey => normalizedLocationKeys.has(organKey))
  )
  const bindingText = mappings
    .map(rule => {
      const directRule = PEST_EVIDENCE_RULES[rule.modeKey] || {}
      const visualEvidenceKeys = new Set(rule.evidence.map(item => item.evidenceKey))
      const canonicalizeEvidenceKey = evidenceKey => {
        const aliases = {
          silver_streaks: 'silver_scarring',
          stippling: 'yellow_speckling'
        }
        const canonicalKey = aliases[evidenceKey] || evidenceKey
        return visualEvidenceKeys.has(canonicalKey) ? canonicalKey : ''
      }
      const formatEvidenceGroup = group =>
        Array.from(
          new Set((Array.isArray(group) ? group : []).map(canonicalizeEvidenceKey).filter(Boolean))
        ).join('|')
      const directAlternatives = [
        ...(Array.isArray(directRule.directGroups) ? directRule.directGroups : []).map(
          formatEvidenceGroup
        ),
        ...(Array.isArray(directRule.directCombinationGroups)
          ? directRule.directCombinationGroups.map(combination =>
              (Array.isArray(combination) ? combination : [])
                .map(formatEvidenceGroup)
                .filter(Boolean)
                .join('+')
            )
          : [])
      ].filter(Boolean)
      const evidenceText = directAlternatives.join(' OR ')
      return `${rule.modeKey}→${evidenceText}`
    })
    .join(';')

  // 位置范围已由动态区紧邻的 allowed_location_keys 明确；不要在每条映射中重复，
  // 以压缩不可缓存的动态尾部。映射内容与该范围一一对应，不能删减或跨器官扩展。
  return mappings.length ? `【虫害映射】:${bindingText}` : ''
}

function compilePestVisualEvidenceHints(locationKeys = []) {
  const normalizedLocationKeys = new Set(
    (Array.isArray(locationKeys) ? locationKeys : [])
      .map(value =>
        String(value || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  )
  if (!normalizedLocationKeys.size) {
    return ''
  }

  const evidenceKeys = Array.from(
    new Set(
      PEST_VISUAL_RULES.filter(rule =>
        rule.organKeys.some(organKey => normalizedLocationKeys.has(organKey))
      ).flatMap(rule => rule.evidence.map(item => item.evidenceKey))
    )
  )
  const hintText = evidenceKeys
    .map(evidenceKey => {
      const hint = PEST_VISUAL_EVIDENCE_HINTS[evidenceKey]
      return hint ? `${evidenceKey}=${hint}` : ''
    })
    .filter(Boolean)
    .join(';')

  return hintText ? `【虫害证据提示】${hintText}。仅画面明确可见才填。` : ''
}

function compilePestVisibleAnomalyDescriptions(locationKeys = []) {
  const normalizedLocationKeys = new Set(
    (Array.isArray(locationKeys) ? locationKeys : [])
      .map(value =>
        String(value || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  )
  if (!normalizedLocationKeys.size) {
    return ''
  }

  const descriptions = Array.from(
    new Map(
      PEST_VISUAL_RULES.filter(rule =>
        rule.organKeys.some(organKey => normalizedLocationKeys.has(organKey))
      )
        .flatMap(rule => rule.visibleAnomalies || [])
        .map(item => [item.evidenceKey, item.description])
    ).entries()
  )

  return descriptions.length
    ? `【当前图可见异常说明】${descriptions
        .map(([evidenceKey, description]) => `${evidenceKey}=${description}`)
        .join('；')}`
    : ''
}

function compileGeneralVisualMapping(locationKeys = []) {
  const normalizedLocationKeys = new Set(
    (Array.isArray(locationKeys) ? locationKeys : [])
      .map(value =>
        String(value || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  )
  if (!normalizedLocationKeys.size) {
    return ''
  }

  const mappings = GENERAL_VISUAL_RULES.filter(rule =>
    rule.organKeys.some(organKey => normalizedLocationKeys.has(organKey))
  )
  const bindingText = mappings
    .map(rule => {
      const directRule = PEST_EVIDENCE_RULES[rule.modeKey] || {}
      const visualEvidenceKeys = new Set(rule.evidence.map(item => item.evidenceKey))
      const formatEvidenceGroup = group =>
        Array.from(
          new Set(
            (Array.isArray(group) ? group : [])
              .map(evidenceKey => (visualEvidenceKeys.has(evidenceKey) ? evidenceKey : ''))
              .filter(Boolean)
          )
        ).join('|')
      const directAlternatives = [
        ...(Array.isArray(directRule.directGroups) ? directRule.directGroups : []).map(
          formatEvidenceGroup
        ),
        ...(Array.isArray(directRule.directCombinationGroups)
          ? directRule.directCombinationGroups.map(combination =>
              (Array.isArray(combination) ? combination : [])
                .map(formatEvidenceGroup)
                .filter(Boolean)
                .join('+')
            )
          : [])
      ].filter(Boolean)
      const evidenceText = directAlternatives.join(' OR ')
      return `${rule.modeKey}→${evidenceText}`
    })
    .join(';')

  // 同上：保留映射的全部模式和证据组合，只移除已由 allowed_location_keys 表达的重复范围。
  return mappings.length ? `【通用映射】:${bindingText}` : ''
}

function compileGeneralVisibleAnomalyDescriptions(locationKeys = []) {
  const normalizedLocationKeys = new Set(
    (Array.isArray(locationKeys) ? locationKeys : [])
      .map(value =>
        String(value || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  )
  if (!normalizedLocationKeys.size) {
    return ''
  }

  const descriptions = Array.from(
    new Map(
      GENERAL_VISUAL_RULES.filter(rule =>
        rule.organKeys.some(organKey => normalizedLocationKeys.has(organKey))
      )
        .flatMap(rule => rule.visibleAnomalies || [])
        .map(item => [item.evidenceKey, item.description])
    ).entries()
  )

  return descriptions.length
    ? `【当前图通用可见异常说明】${descriptions
        .map(([evidenceKey, description]) => `${evidenceKey}=${description}`)
        .join('；')}`
    : ''
}

function hashPromptText(value = '') {
  return crypto
    .createHash('sha1')
    .update(String(value || ''))
    .digest('hex')
}

function localizeStaticPromptSections(cachePrompt = {}) {
  const staticPrefix = String(cachePrompt.staticPrefix || '')
    .replace('[Static Schema]', '[静态输出契约]')
    .replace('[Static Rules]', '[静态规则]')
    .replace('[Static Evidence Directory]', '[静态全局词典]')
  const dynamicTail = String(cachePrompt.dynamicTail || '')

  return {
    promptText: [staticPrefix, dynamicTail].filter(Boolean).join('\n\n').trim(),
    staticPrefixHash: hashPromptText(staticPrefix),
    dynamicTailHash: hashPromptText(dynamicTail)
  }
}

module.exports = {
  FULL_CASE_LOCATION_KEYS,
  LOCATION_LABEL_MAP,
  PROMPT_SYMPTOM_HINTS,
  compileGeneralVisibleAnomalyDescriptions,
  compileGeneralVisualMapping,
  compilePestVisibleAnomalyDescriptions,
  compilePestVisualEvidenceHints,
  compilePestVisualMapping,
  STATIC_ROUTE_CATALOG_TEXT,
  STATIC_READING_DISCIPLINE_TEXT,
  STATIC_VISUAL_WORKFLOW_RULES,
  localizeStaticPromptSections
}
