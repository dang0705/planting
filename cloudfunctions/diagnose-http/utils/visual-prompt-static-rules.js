'use strict'

const crypto = require('crypto')

const { ALLOWED_CAPTURE_REGIONS } = require('./capture-region-normalizer')
const {
  FORMAL_PEST_VISUAL_EVIDENCE_KEYS,
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
  'normalized_organ=leaf|stem|flower|root|root_crown|whole_plant|fruit|other|unknown；capture_region/region_ref=' +
    ALLOWED_CAPTURE_REGIONS.join('|') +
    '。',
  'mode_candidates=yellow_leaf|wilting_droop|powdery_mildew|spider_mite|mealybug|scale_insect|whitefly|aphid|thrips|leaf_miner|fungus_gnat。',
  '虫害可见证据键=' + FORMAL_PEST_VISUAL_EVIDENCE_KEYS.join('|') + '。'
].join('\n')

const STATIC_VISUAL_WORKFLOW_BASE_RULES = [
  '【工作流程】',
  '1. 只标当前图可见证据；不推断触感、气味、遮挡、历史、病因、治疗或最终状态。',
  '2. 只依据图片独立判断当前图是否可见虫体或叶内潜道；不得从 mode key、evidence key、器官名或文字反推画面；不清楚或不在图中=uncertain。',
  '3. 不同图不互投；候选只用动态 allowed_symptom_keys，池外异常用 out_of_pool_symptom_candidates。',
  '4. 当前图证据不是最终诊断；只有图片中明确可见的内容才能作为证据，不能把普通证据键直接当作虫害 mode。',
  '【输出规则】',
  '1. 只返回静态区唯一 JSON 契约；不得输出 confirmed、final_outcome_key、diagnosis_key、treatment_plan。',
  '2. capture_region/region_ref 只写当前图；mode_candidates 只是可见证据候选，confidence≥0.65。',
  '3. 上限：mode 8、symptom 3、池外 1、route 1；机器键≤32字符；清楚证据不要重复问。',
  '4. surface_glossy_residue 仅在图片明确可见且位于允许器官时记录；不确定时 absent 或 uncertain，不能作正向证据。'
].join('\n')

const STATIC_READING_DISCIPLINE_TEXT = [
  '【静态判读纪律与输出一致性】',
  '1. 先辨认当前图片中能够复核的对象，再记录异常；对象可以是虫体、虫卵、菌丝、病斑、缺损、潜道、残留、土粒、水渍或拍摄反光。不能辨认对象时，只能描述可见形态，不能替对象命名。',
  '2. 每项可见证据都依次核对对象、位置、形态、边缘、颜色或质地、分布范围和清晰度。关键要素缺失时应降低把握，不得用植物常识、常见概率或想象出的细节补全。',
  '3. 判断虫体必须先看到可辨认的实体，再描述体形、分节、翅、足、蜡质、硬壳、群集、附着或活动痕迹。只有啃食、排泄物、网丝、蜜状残留或受害纹理时，不能写成已经看见虫体。',
  '4. 判断叶内潜道必须同时看见组织内部连续延伸的轨迹和周围叶肉变化；叶面擦伤、褪绿、斑驳、阴影、折痕或叶脉走向不能替代潜道。无法区分时保留不确定，不强行归类。',
  '5. 判断斑点、霉层、粉层、坏死、缺刻或穿孔时，要区分表面附着、组织变色和缺失边缘。颜色受光照、白平衡、反光和压缩影响时，应以形态和空间关系为主，不把色偏当成独立证据。',
  '6. 位置必须落在图片中能分辨的具体部位，区分叶面、叶背、叶缘、叶脉附近、叶柄、茎节、花部、根部和盆土表面。前景遮挡、重叠叶片和模糊背景不能被当作精确位置。',
  '7. 多种现象同时出现时，先分别记录可直接看见的事实，再判断它们是否属于同一对象。不能因为两个现象常常一起出现，就把其中一个当成另一个的证明，也不能把相邻位置误写成因果关系。',
  '8. 细小目标需要先确认轮廓是否稳定、是否与背景纹理可分离、是否在相邻区域重复出现。单个噪点、压缩块、灰尘、土屑、失焦颗粒或水珠不得直接升级为虫卵、虫体或病原结构。',
  '9. 可见证据与推断必须分开：只输出图片已经显示的形态和位置，不补写发生时间、扩散速度、浇水情况、施肥历史、气味、触感、室内环境、既往处理或肉眼看不见的组织变化。',
  '10. 把握程度只衡量图片对该项证据的支持强度，不衡量结论听起来是否合理。轮廓完整、特征相互印证且位置清楚时可以提高把握；主体被遮挡、失焦、过曝、过暗或像素不足时必须降低把握。',
  '11. 输出同一事实时使用前后一致的对象称呼、位置层级和形态描述。相同观察不应拆成多条近义重复，也不能用不同名称制造多个候选；彼此矛盾的观察应并列保留并明确不确定。',
  '12. 先检查每个候选是否有独立的可见依据，再检查依据是否真的支持该候选。没有独立依据时不新增候选；依据不足时保留空缺或不确定，不以凑满数量为目标。',
  '13. 结构化输出应保持字段之间相互一致：位置描述、可见证据、候选和把握程度必须能由同一画面事实追溯。若无法同时满足，应优先保留可见事实并删除过度推断。',
  '14. 输出前进行一次反证检查：若把对象换成阴影、反光、泥土、叶脉、损伤边缘或背景纹理，现有证据是否仍成立；不能排除这些替代解释时，应使用保守表述。',
  '15. 不因任务名称、器官提示、候选目录、前序结论或文字标签改变对画面的判断顺序。任何结论都必须从当前图片中可复核的结构出发，并允许结果为未见、无法辨认或不确定。'
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
  compilePestVisibleAnomalyDescriptions,
  compilePestVisualMapping,
  STATIC_ROUTE_CATALOG_TEXT,
  STATIC_READING_DISCIPLINE_TEXT,
  STATIC_VISUAL_WORKFLOW_RULES,
  localizeStaticPromptSections
}
