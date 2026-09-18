'use strict'

const { buildCacheFirstVisualPrompt } = require('./visual-prompt-cache-contract')

// 固定前缀：不要按用户图片、植物名或时间拼接任何文本。百炼的显式缓存只可能
// 复用这一段稳定内容；是否真正命中仍必须以后端 usage 的 cache 指标为准。
const SOIL_SCHEMA_TEXT = [
  '只返回一个 JSON 对象，不要 Markdown。',
  '字段格式：{"accepted":true或false,"surfaceState":"wet|moist|dry|uncertain","standingWater":"yes|no|uncertain","visibility":"clear|limited|unusable","confidence":数字,"visibleBasisCn":"简短中文"}。',
  'confidence 必须是 0 到 1 之间的数字。'
].join('\n')

const SOIL_RULE_TEXT = [
  '请先确认画面是否包含盆土表面；若没有盆土，请返回 accepted=false 且 visibility=unusable。',
  '只描述盆土表面实际可见的内容，不推测盆内深处、浇水日期、植物种类、病害或浇水指令。',
  'surfaceState=wet 仅表示表面明显湿润、有水光或可见积水；dry 仅表示表面明显干燥、松散、发白或开裂；否则返回 moist 或 uncertain。',
  'standingWater=yes 仅表示画面中确实看见积水。',
  '图片模糊、过暗、被遮挡，或盆土表面不足以判断时，返回 accepted=false、visibility=unusable。',
  'visibleBasisCn 用简短中文说明你在图片中看到的盆土证据，不写诊断或养护建议。'
].join('\n')

const SOIL_EVIDENCE_DIRECTORY_TEXT = [
  'wet：表面明显发黑、发亮、湿润，或看见积水。',
  'moist：表面看起来有湿气，但没有明确积水。',
  'dry：表面明显发白、松散、无光泽或开裂，且画面清楚。',
  'uncertain：阴影、铺面、石块或可见土面太少，无法可靠判断。'
].join('\n')

function buildWateringSoilPromptPayload() {
  return buildCacheFirstVisualPrompt({
    taskLine: 'Classify one photo as observable pot-soil surface evidence for a watering safety check.',
    schemaText: SOIL_SCHEMA_TEXT,
    ruleText: SOIL_RULE_TEXT,
    evidenceDirectoryText: SOIL_EVIDENCE_DIRECTORY_TEXT,
    dynamicTaskText:
      '图片已附上，请直接读取图片内容并判断当前盆土表面；不要回复未提供图像。现在返回 JSON 对象。'
  })
}

module.exports = {
  SOIL_SCHEMA_TEXT,
  SOIL_RULE_TEXT,
  SOIL_EVIDENCE_DIRECTORY_TEXT,
  buildWateringSoilPromptPayload
}
