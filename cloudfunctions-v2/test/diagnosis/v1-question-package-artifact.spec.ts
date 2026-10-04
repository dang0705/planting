import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'

/** unit_real_data / L1：验证用户授权复用的真实V1制品与来源摘要，不证明内容审核或运行发布。 */
const root = findProjectRoot()
const artifactBytes = readFileSync(join(root, 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'))
const artifact = JSON.parse(artifactBytes.toString()) as {
  fixed: Record<string, Record<string, unknown>[]>
  pestQuestions: Record<string, unknown>[]
  pestLabels: Record<string, string>
}
const manifest = JSON.parse(readFileSync(join(root, 'cloudfunctions-v2/models/diagnosis/v1-reuse/manifest.json'), 'utf8')) as {
  status: string; scope: string[]; sources: { path: string; sha256: string }[]; artifactSha256: string
}

describe('V1三类题包复用制品', () => {
  test('保留真实题目及来源内容摘要，不冒充已发布题包', () => {
    expect(manifest.status).toBe('source_content_snapshot_not_published')
    expect(manifest.scope).toEqual(['yellow_leaf', 'wilting_droop', 'specific_pest_visual'])
    expect(createHash('sha256').update(artifactBytes).digest('hex')).toBe(manifest.artifactSha256)
    for (const source of manifest.sources) {
      expect(source.path.startsWith('cloudfunctions/diagnose-http/')).toBe(true)
      expect(createHash('sha256').update(readFileSync(join(root, source.path))).digest('hex')).toBe(source.sha256)
    }
  })
  test('固定包保留浇水、空气等复合题元数据，不改成纯普通选项题', () => {
    expect(artifact.fixed.yellow_leaf!.map(q => q.packageTopic)).toEqual(['watering_frequency_context', 'light_change_context', 'fertilization_growth_context', 'air_environment'])
    expect(artifact.fixed.wilting_droop!.map(q => q.packageTopic)).toEqual(['watering_frequency_context', 'wilting_shape', 'wilting_rhythm_environment', 'air_environment', 'recent_stress', 'wilting_high_risk'])
    expect(artifact.fixed.yellow_leaf![0]!.uiVariant).toBe('care_behavior_timeline')
    expect(artifact.fixed.yellow_leaf![3]!.questionType).toBe('air_environment')
  })
  test('虫害保留八类、十四题素材及接触操作的同意与跳过提示', () => {
    expect(Object.keys(artifact.pestLabels)).toEqual(['spider_mite','thrips','whitefly','aphid','scale_insect','mealybug','leaf_miner','fungus_gnat'])
    expect(artifact.pestQuestions).toHaveLength(14)
    const touch = artifact.pestQuestions.find(q => q.packageTopic === 'whitefly_adults')!
    expect(touch.requiresExplicitConsent).toBe(true)
    expect(touch.skipOptionEnabled).toBe(true)
    expect(touch.riskNotice).toBe('需要轻碰叶片；如果植株脆弱、过敏或不方便操作，请直接跳过。')
    expect(touch.safetyInstructions).toEqual(['先确认手部安全','只轻碰叶片边缘','不方便操作时请选择跳过'])
  })
})
