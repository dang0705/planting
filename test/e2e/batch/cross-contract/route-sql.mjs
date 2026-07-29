import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const ROUTE_TABLES = [
  'outcome_route_groups',
  'outcome_routes',
  'outcome_route_conditions',
  'outcome_route_questions',
  'outcome_answer_effects',
  'outcome_action_profiles',
  'diagnosis_outcomes'
]

const REQUIRED_QUESTION_KEYS = [
  'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
  'q_observed_probe__leaf_yellowing__watering_frequency_context',
  'q_observed_probe__leaf_yellowing__light_change_context',
  'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
  'q_observed_probe__holes_in_leaf__structural_cause',
  'q_holes_in_leaf_confirm'
]

async function readFile(path) {
  return fs.readFile(path, 'utf8')
}

function expectIncludes(source, fragment, message) {
  assert.equal(source.includes(fragment), true, message)
}

async function testRouteSchemaAndSeed() {
  const [
    schemaSql,
    seedSql,
    tableConfig,
    questionRepositorySource,
    questionPackageTopicSource,
    diagnosisEngineSource,
    contextRequiredGuardSource,
    questionTemplateGovernanceSql
  ] = await Promise.all([
    readFile('./scripts/sql/ensure-outcome-route-tables.sql'),
    readFile('./scripts/sql/seed-outcome-route-mvp.sql'),
    readFile('./src/data-system/config/tables.js'),
    readFile('./cloudfunctions/diagnose-http/repositories/question-repository.js'),
    readFile('./cloudfunctions/diagnose-http/utils/question-package-topic.js'),
    readFile('./cloudfunctions/diagnose-http/domain/diagnosis-engine.js'),
    readFile('./cloudfunctions/diagnose-http/utils/context-required-problem-guard.js'),
    readFile('./scripts/sql/question-data-layer-template-governance-20260429.sql')
  ])

  for (const tableName of ROUTE_TABLES) {
    expectIncludes(
      schemaSql,
      `CREATE TABLE IF NOT EXISTS ${tableName} (`,
      `schema 缺少 ${tableName}`
    )
    expectIncludes(
      tableConfig,
      `table: '${tableName}'`,
      `tables.js 缺少 ${tableName} 配置`
    )
  }

  for (const tableName of ['diagnosis_outcomes', 'outcome_action_profiles', 'outcome_route_groups', 'outcome_routes', 'outcome_route_conditions', 'outcome_route_questions', 'outcome_answer_effects']) {
    expectIncludes(
      seedSql,
      `REPLACE INTO ${tableName} (`,
      `seed 缺少 ${tableName} 数据`
    )
  }

  for (const questionKey of REQUIRED_QUESTION_KEYS) {
    const existsInQuestionRepo = questionRepositorySource.includes(`${questionKey}: {`)
    const existsInPackageTopic = questionPackageTopicSource.includes(`${questionKey}:`)
    const existsInDiagnosisEngine = diagnosisEngineSource.includes(`'${questionKey}'`)
    const existsInContextGuard = contextRequiredGuardSource.includes(`'${questionKey}'`)
    const existsInQuestionTemplateGovernance = questionTemplateGovernanceSql.includes(`'${questionKey}'`)
    assert.equal(
      existsInQuestionRepo ||
        existsInPackageTopic ||
        existsInDiagnosisEngine ||
        existsInContextGuard ||
        existsInQuestionTemplateGovernance,
      true,
      `seed 使用的 question_key 未在仓库静态定义中命中: ${questionKey}`
    )
    expectIncludes(seedSql, `'${questionKey}'`, `seed 缺少 question_key: ${questionKey}`)
  }

  expectIncludes(seedSql, `'overwatering_root_pressure'`, 'seed 缺少 overwatering_root_pressure')
  expectIncludes(seedSql, `'underwatering'`, 'seed 缺少 underwatering')
  expectIncludes(seedSql, `'normal_leaf_aging'`, 'seed 缺少 normal_leaf_aging')
  expectIncludes(seedSql, `'yellowing_low_light_route'`, 'seed 缺少 yellowing_low_light_route')
  expectIncludes(seedSql, `'yellowing_sunburn_route'`, 'seed 缺少 yellowing_sunburn_route')
  expectIncludes(seedSql, `'chewing_pest_damage'`, 'seed 缺少 chewing_pest_damage')
  expectIncludes(
    seedSql,
    "q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet",
    '湿土 condition 缺少基于黄叶浇水上下文的闭合条件'
  )
  expectIncludes(
    seedSql,
    "q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry",
    '干土 condition 缺少基于黄叶浇水上下文的闭合条件'
  )
  assert.equal(
    seedSql.includes("('q_observed_probe__leaf_yellowing__yellowing_primary_clue_condition'"),
    false,
    'seed 不应再写入既有 yellowing_primary_clue_condition 路径'
  )
  assert.equal(
    /yellowing_(wet_soil|dry_soil|low_light|sunburn)_route[\s\S]*?, 3, 'uncertain'/.test(seedSql),
    false,
    '黄叶 route 不应再保留 max_questions=3'
  )
  expectIncludes(
    seedSql,
    "q_observed_probe__leaf_yellowing__light_change_context:weaker_light",
    '弱光 condition 缺少基于黄叶光照上下文的闭合条件'
  )
  expectIncludes(
    seedSql,
    "q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light",
    '强光 condition 缺少基于黄叶光照上下文的闭合条件'
  )
  expectIncludes(seedSql, `'action_sunburn_basic'`, 'seed 缺少晒伤 action profile 绑定')
}

async function main() {
  console.log('=== Route SQL 测试开始 ===\n')
  await testRouteSchemaAndSeed()
  console.log('✓ route SQL schema / seed / config 一致性')
  console.log('\n==================================================')
  console.log('✓ Route SQL 本地测试通过')
  console.log('==================================================')
}

main().catch(error => {
  console.error('✗ Route SQL 测试失败:', error)
  process.exit(1)
})
