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

const STATIC_ROUTE_CATALOG_TEXT = [
  '【全局词典】',
  'normalized_organ=leaf|stem|flower|root|root_crown|soil|whole_plant|fruit|other|unknown；capture_region/region_ref=' +
    ALLOWED_CAPTURE_REGIONS.join('|') +
    '。',
  'mode_candidates=yellow_leaf|wilting_droop|powdery_mildew|sooty_mold|spider_mite|mealybug|scale_insect|whitefly|aphid|thrips|leaf_miner|fungus_gnat。',
  '虫害可见证据键=' + FORMAL_PEST_VISUAL_EVIDENCE_KEYS.join('|') + '。'
].join('\n')

const STATIC_VISUAL_WORKFLOW_BASE_RULES = [
  '【工作流程】',
  '1. 只标当前图可见证据；不推断触感、气味、遮挡、历史、病因、治疗或最终状态。',
  '2. 仅按图片判断当前图的虫体、叶内潜道、霉层、粉层和异常变色/下垂；不从 mode/evidence/器官/文字反推；只报明确可见项；不清楚或不在图中=uncertain。',
  '3. 逐图：只看当前图；case_slot_summary 仅是槽位元数据；多图证据由服务端按来源汇总。',
  '4. 当前图证据不等于病因/治疗；normalized_organ 按像素识别、不照抄 input_slot_type；不清楚填 unknown；image_id 回显当前输入。',
  '【输出规则】',
  '1. 只返回静态区唯一 JSON 契约；不得输出 confirmed、final_outcome_key、diagnosis_key、treatment_plan。',
  '2. capture_region/region_ref 只写当前图；symptom 尽量填对应 region_ref；mode 只是当前图候选。',
  '3. 上限：mode 8、symptom 3、池外 1、route 1；机器键≤32字符；清楚证据不要重复问。',
  '4. surface_glossy_residue 仅在图片明确可见且位于允许器官时记录；不确定时 absent 或 uncertain，不能作正向证据。',
  '5. confidence≥0.95 表示当前图候选高把握，可进入已有快速路径；不等于病因/因果/治疗；低候选不是反证。'
].join('\n')

const STATIC_READING_DISCIPLINE_TEXT = [
  '【静态判读纪律与输出一致性】',
  '1. 先辨认当前图片中能够复核的对象，再只标当前图可见异常；不能辨认对象时只描述形态，不替对象命名。',
  '2. 核对对象、位置、形态、颜色/质地、分布和清晰度；关键要素缺失就降低把握，不用常识补全。',
  '3. 虫体须先有可辨认实体；仅有啃食、排泄物、网丝、残留或受害纹理，不得写成看见虫体。',
  '4. 叶内潜道须有组织内部连续轨迹及周围叶肉变化；擦伤、褪绿、斑驳、阴影、折痕或叶脉不能替代。',
  '5. 区分表面附着（霉层/粉层）与组织变色（病斑/黄化）；附着物须有边界、质地和范围，变色不能当附着；受光、反光或压缩影响时以形态和位置为准。',
  '6. 位置须是图中可分辨的叶面/叶背/叶缘/叶脉/叶柄/茎/花/根/盆土；遮挡、重叠和模糊背景不算精确位置。',
  '7. 多现象先分开记录，再判断是否同一对象；共现不证明因果，相邻位置也不等于因果。',
  '8. 细小目标先确认轮廓稳定、能与背景分离或重复出现；噪点、压缩块、灰尘、土屑、失焦颗粒和水珠不得直接升级为虫卵、虫体或病原结构。',
  '9. 分开可见证据与推断：只写图片显示的形态/位置，不补时间、扩散、浇水、施肥、气味、触感、环境、处理或不可见变化。',
  '10. 把握程度只衡量图片支持强度；轮廓完整、特征一致、位置清楚可提高，遮挡、失焦、过曝、过暗或像素不足必须降低。',
  '11. 同一事实使用一致的对象、位置和形态称呼；不拆近义重复，不用不同名称制造候选；矛盾观察并列并标不确定。',
  '12. 每个候选须有独立可见依据；依据不足时留空或不确定，不为凑数。',
  '13. 位置、证据、候选和把握程度须能由同一画面追溯；不能同时满足时保留可见事实。',
  '14. 输出前反证：若可能是阴影、反光、泥土、叶脉、损伤边缘或背景纹理，不能排除时保守表述。',
  '15. 不因任务名、器官提示、候选目录、前序结论或文字标签改变判断；结论须来自当前图结构，可为未见、无法辨认或不确定。',
  '16. 霉层/粉层须有明确附着物、颜色、质地和范围；变色、反光或水渍不算。',
  '17. 图片未拍到的部位只能记为未见，不能记为不存在或已排除；当前图看不清也不能借另一张图的线索补写。',
  '18. 叶片图、盆土图或整株图即使同时上传，也要分别绑定图号、器官和区域；一张图的观察不能冒充另一张图的观察。',
  '19. 土表颜色、反光、水珠或少量积水只能作为图中现象；不能据此直接写成根区长期过湿、缺水、根腐或虫害原因。',
  '20. 输出前逐项检查 image_id、normalized_organ、capture_region 和每个候选是否来自当前画面；缺少可复核来源时降为 uncertain 或删除，不用文字标签补全。',
  '21. 发生同一模式的不同候选时，保留各自当前图把握和依据；高置信候选可进入既有快速路径，较低候选仅作为次要线索，不当作反证。',
  '22. 当前图的器官识别、症状位置和候选模式必须分别输出；器官槽位只能帮助定位输入，不能代替像素识别，也不能覆盖模型观察。'
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

  return mappings.length
    ? `【虫害映射】organ=${Array.from(normalizedLocationKeys).join(',')}:${bindingText}`
    : ''
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
      // 当模式键与唯一证据键同名时，裸映射是废话；补一句纯视觉特征避免模型忽略。
      if (evidenceText === rule.modeKey) {
        const anomaly = (rule.visibleAnomalies || []).find(
          item => item.evidenceKey === evidenceText
        )
        if (anomaly) {
          return `${rule.modeKey}→${evidenceText}(${anomaly.description})`
        }
      }
      return `${rule.modeKey}→${evidenceText}`
    })
    .join(';')

  return mappings.length
    ? `【通用映射】organ=${Array.from(normalizedLocationKeys).join(',')}:${bindingText}`
    : ''
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
  compilePestVisualMapping,
  STATIC_ROUTE_CATALOG_TEXT,
  STATIC_READING_DISCIPLINE_TEXT,
  STATIC_VISUAL_WORKFLOW_RULES,
  localizeStaticPromptSections
}
