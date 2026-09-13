'use strict'

const { buildCacheFirstVisualPrompt } = require('./visual-prompt-cache-contract')

// 固定前缀：不要按用户图片、植物名或时间拼接任何文本。百炼的显式缓存只可能
// 复用这一段稳定内容；是否真正命中仍必须以后端 usage 的 cache 指标为准。
const SOIL_SCHEMA_TEXT = [
  'Return exactly one JSON object and no markdown.',
  'Schema: {"accepted":boolean,"surfaceState":"wet|moist|dry|uncertain","standingWater":"yes|no|uncertain","visibility":"clear|limited|unusable","confidence":number,"visibleBasisCn":string}.',
  'confidence is a number from 0 to 1.'
].join('\n')

const SOIL_RULE_TEXT = [
  'First decide whether the image subject is a visible pot-soil surface. If not, accepted=false and visibility=unusable.',
  'Only describe what is visible on the surface. Never infer root-zone moisture, watering date, plant species, disease, or a watering command.',
  'surfaceState=wet only for clearly wet or glossy substrate; dry only for clearly dry loose-looking surface; otherwise moist or uncertain.',
  'standingWater=yes only when visible pooled water is present.',
  'Use accepted=false when the subject is not pot soil, the image is too blurred, too dark, blocked, or insufficient for a soil-surface observation.',
  'visibleBasisCn must be a short Chinese description of visible evidence, without diagnosis or care instructions.'
].join('\n')

const SOIL_EVIDENCE_DIRECTORY_TEXT = [
  'wet: visibly dark or glossy wet substrate, or pooled water.',
  'moist: surface appears damp but no clear pooled water.',
  'dry: visibly pale, loose, matte or cracked surface, only when clear.',
  'uncertain: mixed substrate, shadow, mulch, stones, or insufficient visible surface prevents a reliable surface judgement.'
].join('\n')

function buildWateringSoilPromptPayload() {
  return buildCacheFirstVisualPrompt({
    taskLine: 'Classify one photo as observable pot-soil surface evidence for a watering safety check.',
    schemaText: SOIL_SCHEMA_TEXT,
    ruleText: SOIL_RULE_TEXT,
    evidenceDirectoryText: SOIL_EVIDENCE_DIRECTORY_TEXT,
    dynamicTaskText: 'Inspect the current single image now and return the JSON object.'
  })
}

module.exports = {
  SOIL_SCHEMA_TEXT,
  SOIL_RULE_TEXT,
  SOIL_EVIDENCE_DIRECTORY_TEXT,
  buildWateringSoilPromptPayload
}
