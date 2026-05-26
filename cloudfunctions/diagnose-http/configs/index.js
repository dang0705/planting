const FAST_VISION_PROFILE = 'fast_vision'
const QWEN_VL_FAST_VISION_PROFILE = 'qwen_vl_fast_vision'
const DEEP_THINKING_VISION_PROFILE = 'deep_thinking_vision'
const DEFAULT_MODEL_PROFILE = QWEN_VL_FAST_VISION_PROFILE
function envText(name, fallback = '') {
  const value = String(process.env[name] || '').trim()
  return value || fallback
}

function envNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

function envBoolean(name, fallback = false) {
  const raw = String(process.env[name] || '').trim().toLowerCase()
  if (!raw) {return fallback}
  if (['1', 'true', 'yes', 'on'].includes(raw)) {return true}
  if (['0', 'false', 'no', 'off'].includes(raw)) {return false}
  return fallback
}

const modelProfiles = {
  [FAST_VISION_PROFILE]: {
    provider: envText('LLM_FAST_SERVICE', 'hunyuan'),
    model: envText('LLM_FAST_MODEL', 'hunyuan-vision-1.5-instruct'),
    reasoningMode: 'fast'
  },
  [QWEN_VL_FAST_VISION_PROFILE]: {
    provider: envText('LLM_QWEN_VL_FAST_SERVICE', 'cloudbase_qwen_vl'),
    model: envText('LLM_QWEN_VL_FAST_MODEL', 'qwen3-vl-plus'),
    reasoningMode: 'fast'
  },
  [DEEP_THINKING_VISION_PROFILE]: {
    provider: envText('LLM_DEEP_THINKING_SERVICE', 'hunyuan'),
    model: envText('LLM_DEEP_THINKING_MODEL', 'hunyuan-t1-vision-20250916'),
    reasoningMode: 'deep_thinking'
  }
}

const requestedModelProfile = envText('LLM_MODEL_PROFILE', DEFAULT_MODEL_PROFILE)
const activeModelProfile = modelProfiles[requestedModelProfile]
  ? requestedModelProfile
  : DEFAULT_MODEL_PROFILE
const activeModelProfileConfig = modelProfiles[activeModelProfile]

const VISUAL_PROMPT_LINES = [
  {
    en: 'You are PlantSight-Visual; normalize one plant image for diagnosis.',
    zh: '你是 PlantSight-Visual，只负责把单张植物图片标准化为诊断可用的视觉信息。'
  },
  {
    en: 'Use only visible evidence in this image; infer no cause, cure, diagnosis, smell, hidden soil, history, or progression.',
    zh: '只使用当前图片可见证据，不推断病因、治疗、诊断、气味、深层土壤、历史或变化过程。'
  },
  {
    en: 'Choose <=5 symptom_candidates, only from the narrowed candidate pool.',
    zh: 'symptom_candidates 最多 5 条，且只能来自已经缩窄后的候选池。'
  },
  {
    en: 'Candidate Catalog is global; symptom_candidates must obey Dynamic Task allowed_location_keys.',
    zh: 'Candidate Catalog 是全局全集；symptom_candidates 必须服从 Dynamic Task 中的 allowed_location_keys。'
  },
  {
    en: 'Do not force cross-organ or cross-slot matches.',
    zh: '不要跨器官或跨槽位硬套候选项。'
  },
  {
    en: 'Visible insects, eggs, dots, or foreign bodies outside the pool go to out_of_pool_symptom_candidates, not non_problematic.',
    zh: '候选池外可见昆虫、卵、点状物或异物时，写入 out_of_pool_symptom_candidates，不要判为 non_problematic。'
  },
  {
    en: 'Prefer structural damage for true holes, chewed edges, missing tissue, see-through gaps, tunnels, or skeletonized leaves.',
    zh: '看到真实孔洞、啃咬边缘、组织缺失、透背景空洞、潜道或骨架化时，优先结构损伤类。'
  },
  {
    en: 'Dark rims, browning, dry edges, or secondary necrosis near damage do not demote structural evidence.',
    zh: '损伤附近的黑边、褐化、干边或次生坏死不应削弱结构证据。'
  },
  {
    en: 'Emit structural keys only with explicit structural evidence.',
    zh: '只有存在明确结构证据时，才输出结构类 key。'
  },
  {
    en: 'If structure and spots coexist, keep structure first unless a separate intact spot is clearly stronger.',
    zh: '结构损伤和斑点并存时，除非独立完整的斑点明显更强，否则结构类优先。'
  },
  {
    en: 'Report yellow_speckling only for dense, repeated, clustered, low-chroma speckles.',
    zh: '只有密集、重复、成簇且低饱和的小黄点可见时，才上报 yellow_speckling。'
  },
  {
    en: 'Do not map local dark blotches, margin necrosis, or edge discoloration to leaf_yellowing by default.',
    zh: '不要把局部暗斑、边缘坏死或边缘变色默认映射为 leaf_yellowing。'
  },
  {
    en: 'Map powdery, gray-black, or removable films to surface-coverage/mold patterns, not internal spots.',
    zh: '白粉、灰黑或可擦除膜状物应归为表面覆盖或霉层模式，不归为内部斑点。'
  },
  {
    en: 'For weak signs, be conservative: specific evidence beats completeness; do not guess.',
    zh: '弱信号要保守，优先具体证据而不是凑全，不要猜。'
  },
  {
    en: 'Before possible_non_problematic_signal, scan for repeated tiny white/pale dots, short ovals, eggs, shells, insects, or foreign bodies.',
    zh: '给出 possible_non_problematic_signal 前，先检查是否有多枚细小白点、浅色短椭圆、卵、壳、昆虫或外来物。'
  },
  {
    en: 'If visible but not a pool symptom, put one in out_of_pool_symptom_candidates even with low confidence; do not mark non_problematic.',
    zh: '若这些可见物不属于候选池症状，即使置信度低，也写入一个 out_of_pool_symptom_candidates，不要判为 non_problematic。'
  },
  {
    en: 'If quality/analyzability is good and no stable actionable sign exists, leave both candidate arrays empty and add route_hints=[{"type":"possible_non_problematic_signal","reason":"no_stable_problematic_visual_signal"}].',
    zh: '图像质量和可分析性良好但无稳定问题信号时，两个候选列表留空，并加入 possible_non_problematic_signal 路由提示。'
  },
  {
    en: 'If organ is uncertain, set normalized_organ="unknown"; route_hints are process hints only.',
    zh: '器官不确定时设置 normalized_organ=unknown；route_hints 只作为流程提示。'
  },
  {
    en: 'Keep JSON lean: no display names, region notes, follow-up descriptions, or normalization notes.',
    zh: '保持 JSON 精简：不要输出显示名、区域描述、补图长文案或归一化备注。'
  },
  {
    en: 'Forbidden legacy keys: display_name_cn, visibility_scope, supporting_region_note, admission_readiness, suggested_followup_capture, normalization_notes.',
    zh: '禁止输出旧字段：display_name_cn、visibility_scope、supporting_region_note、admission_readiness、suggested_followup_capture、normalization_notes。'
  },
  {
    en: 'Return strict JSON only, using only schema keys/enums below.',
    zh: '只返回严格 JSON，并且只使用下方 schema 中的字段和枚举值。'
  }
]

const VISUAL_PROMPT_EN = VISUAL_PROMPT_LINES.map((line) => line.en).join('\n')
const VISUAL_PROMPT_SCHEMA_HEADER = {
  en: '[Static Schema]',
  zh: '静态 Schema 区。'
}
const VISUAL_PROMPT_CANDIDATE_CATALOG_HEADER = {
  en: '[Static Candidate Catalog]',
  zh: '静态候选池全集区。'
}
const VISUAL_PROMPT_DYNAMIC_TASK_HEADER = {
  en: '[Dynamic Task]',
  zh: '动态任务区。'
}
const VISUAL_RESPONSE_SCHEMA =
  '{"normalized_organ":"leaf|stem|root|root_crown|whole_plant|flower|fruit|other|unknown","image_quality_grade":"good|medium|poor","analyzability":"high|medium|marginal|low","symptom_candidates":[{"symptom_key":"","strength_level":"strong|medium|weak","confidence_band":"high|medium|low"}],"out_of_pool_symptom_candidates":[{"raw_visual_name_cn":"","closest_symptom_key_hint":""}],"route_hints":["retake_image|request_specific_organ|possible_non_problematic_signal"]}'

function buildVisualLlmPrompt({
  symptomOptionsText = '',
  imageContextText = '',
  candidateCatalogText = '',
  dynamicTaskText = ''
} = {}) {
  const catalogText = candidateCatalogText || symptomOptionsText || 'No formal candidate catalog.'
  const taskText = dynamicTaskText || imageContextText || 'No extra context.'

  return `${VISUAL_PROMPT_EN}

${VISUAL_PROMPT_SCHEMA_HEADER.en}
${VISUAL_RESPONSE_SCHEMA}

${VISUAL_PROMPT_CANDIDATE_CATALOG_HEADER.en}
${catalogText}

${VISUAL_PROMPT_DYNAMIC_TASK_HEADER.en}
${taskText}`
}

module.exports = {
  llm: {
    host: envText('LLM_HOST', 'hunyuan.tencentcloudapi.com'),
    modelProfiles,
    modelProfile: activeModelProfile,
    modelReasoningMode: activeModelProfileConfig.reasoningMode,
    model: envText('LLM_MODEL', activeModelProfileConfig.model),
    service: envText('LLM_SERVICE', activeModelProfileConfig.provider),
    fallbackService: envText('LLM_FALLBACK_SERVICE', ''),
    fallbackModel: envText('LLM_FALLBACK_MODEL', 'hunyuan-vision-1.5-instruct'),
    shadowService: envText('LLM_SHADOW_SERVICE', ''),
    shadowModel: envText('LLM_SHADOW_MODEL', ''),
    requestTimeoutSec: envNumber('LLM_REQUEST_TIMEOUT_SEC', 45),
    maxImages: 1,
    sse: envBoolean('LLM_SSE', true),
    cloudbaseAi: {
      envId: envText('CLOUDBASE_AI_ENV_ID', envText('CLOUDBASE_ENV_ID', envText('TCB_ENV', ''))),
      provider: envText(
        'LLM_PROVIDER_NAME',
        envText('LLM_CLOUDBASE_AI_PROVIDER', 'aliyun-bailian-custom')
      ),
      apiKey: envText(
        'LLM_API_KEY',
        envText('CLOUDBASE_AI_API_KEY', envText('CLOUDBASE_AI_ACCESS_TOKEN', ''))
      ),
      baseUrl: envText('LLM_CLOUDBASE_AI_BASE_URL', ''),
      endpointStyle: envText('LLM_CLOUDBASE_AI_ENDPOINT_STYLE', ''),
      imageMaxPixels: envNumber('LLM_CLOUDBASE_AI_IMAGE_MAX_PIXELS', 1638400),
      maxTokens: envNumber('LLM_CLOUDBASE_AI_MAX_TOKENS', 512)
    },
    hfAutotrain: {
      endpoint: envText('HF_AUTOTRAIN_ENDPOINT', ''),
      apiKey: envText('HF_AUTOTRAIN_API_KEY', ''),
      timeoutMs: envNumber('HF_AUTOTRAIN_TIMEOUT_MS', 60000),
      topK: envNumber('HF_AUTOTRAIN_TOP_K', 3),
      modelName: envText('HF_AUTOTRAIN_MODEL_NAME', 'henglidadi/symptoms')
    },
    options: {
      TopP: 0.1,
      Temperature: 0.1,
      Seed: 42
    }
  },
  prompts: {
    llm: ({
      symptomOptionsText = '',
      imageContextText = '',
      candidateCatalogText = '',
      dynamicTaskText = ''
    } = {}) =>
      buildVisualLlmPrompt({
        symptomOptionsText,
        imageContextText,
        candidateCatalogText,
        dynamicTaskText
      })
  }
}
