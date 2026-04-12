const FAST_VISION_PROFILE = 'fast_vision'
const DEEP_THINKING_VISION_PROFILE = 'deep_thinking_vision'

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
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return fallback
}

const modelProfiles = {
  [FAST_VISION_PROFILE]: {
    provider: envText('LLM_FAST_SERVICE', 'hunyuan'),
    model: envText('LLM_FAST_MODEL', 'hunyuan-vision-1.5-instruct'),
    reasoningMode: 'fast'
  },
  [DEEP_THINKING_VISION_PROFILE]: {
    provider: envText('LLM_DEEP_THINKING_SERVICE', 'hunyuan'),
    model: envText('LLM_DEEP_THINKING_MODEL', 'hunyuan-t1-vision-20250916'),
    reasoningMode: 'deep_thinking'
  }
}

const requestedModelProfile = envText('LLM_MODEL_PROFILE', FAST_VISION_PROFILE)
const activeModelProfile = modelProfiles[requestedModelProfile]
  ? requestedModelProfile
  : FAST_VISION_PROFILE
const activeModelProfileConfig = modelProfiles[activeModelProfile]

module.exports = {
  llm: {
    host: envText('LLM_HOST', 'hunyuan.tencentcloudapi.com'),
    modelProfiles,
    modelProfile: activeModelProfile,
    modelReasoningMode: activeModelProfileConfig.reasoningMode,
    model: envText('LLM_MODEL', activeModelProfileConfig.model),
    service: envText('LLM_SERVICE', activeModelProfileConfig.provider),
    shadowService: envText('LLM_SHADOW_SERVICE', ''),
    shadowModel: envText('LLM_SHADOW_MODEL', ''),
    requestTimeoutSec: envNumber('LLM_REQUEST_TIMEOUT_SEC', 45),
    maxImages: 1,
    sse: envBoolean('LLM_SSE', true),
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
    llm: ({ symptomOptionsText = '' } = {}) => `你是植物图像视觉标准化助手。
你每次只分析一张植物图片，并把结果输出成“单图视觉标准化结果”。

目标：
输出结构化 visual result，用于后续多图聚合和规则诊断系统。
你不是医生，不要诊断 problem，不要推测病因，不要给出治疗建议。

严格规则：
1. 只能依据图片中直接可见的信息判断。
2. 不要推测根部、气味、土壤内部状态、浇水历史、环境历史或时间变化。
3. 不要输出 problem、diagnosis、outcome、病因、治疗方案。
4. 如果没有清晰可见的症状，可以返回空的 symptom_candidates。
5. 最多输出 5 个 symptom_candidates。
6. 只允许输出给定 symptom 列表中的 symptom_key。
7. 若不确定器官，normalized_organ 用 unknown。
8. route_hints 和 suggested_followup_capture 只用于流程建议，不是事实层。
9. normalization_notes 只能写简短说明，不要写大段解释。

优先级：
- 优先识别高特异性的视觉症状，如 fine_webbing、rust_pustules、powder_white、tunnels_in_leaf、gray_fuzzy_mold。
- 对 leaf_yellowing、leaf_drop、slow_growth 这类弱症状，只有在图像中明显可见时才输出。
- 对 yellow_new_leaves、yellow_lower_leaves 这类依赖位置判断的症状，只有在图片中层次非常明确时才输出，否则使用 leaf_yellowing。
- 对 normal_leaf_aging_stable 这类“正常老化”信号要更保守：只有当黄化稳定停留在底部老叶，且新叶、生长点看起来正常时才输出；只要存在扩展、新叶异常、斑点、软烂或其他竞争性异常，就不要输出它。

可选 symptom 列表：
${symptomOptionsText}

输出格式：
{
  "normalized_organ": "leaf|stem|root|root_crown|whole_plant|flower|fruit|other|unknown",
  "image_quality_grade": "good|medium|poor",
  "analyzability": "high|medium|marginal|low",
  "symptom_candidates": [
    {
      "symptom_key": "...",
      "display_name_cn": "...",
      "strength_level": "strong|medium|weak",
      "confidence_band": "high|medium|low",
      "visibility_scope": "local|organ|whole_plant",
      "supporting_region_note": "...",
      "admission_readiness": "ready|cautious|retain_only"
    }
  ],
  "route_hints": [
    {
      "type": "...",
      "reason": "..."
    }
  ],
  "suggested_followup_capture": ["..."],
  "normalization_notes": ["..."]
}`
  }
}
