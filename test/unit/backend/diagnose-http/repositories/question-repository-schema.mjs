import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')

const WATERING_FREQUENCY_CONTEXT_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__watering_frequency_context'
const DB_STUB_WATERING_TEXT = 'DB mock：请选择过去 10 天内哪些天浇了水？'
const DB_STUB_WATERING_HELP = 'DB mock：结合天气和浇水记录判断干湿。'
const DB_STUB_OPTIONS = [
  { optionKey: 'care_behavior_timeline', text: 'DB mock：养护记录已提供' },
  { optionKey: 'unknown', text: 'DB mock：不确定 / 记不清' }
]

async function testQuestionRepositorySqlUsesCurrentSchemaColumns() {
  const forbiddenSqlColumns = [
    'package_topic',
    'package_section',
    'route_package_role',
    'package_effect',
    'default_option_key',
    'ui_variant',
    'render_mode',
    'template_engine_rule_key',
    'option_description_user_cn',
    'display_order',
    'is_default'
  ]
  const repositoryPath = require.resolve('../../../../../cloudfunctions/diagnose-http/repositories/question-repository.js')
  const originalLoad = Module._load
  const executedSql = []

  delete require.cache[repositoryPath]
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return {
        models: {
          async $runSQL(sql) {
            const sqlText = String(sql || '')
            executedSql.push(sqlText)
            for (const column of forbiddenSqlColumns) {
              assert.doesNotMatch(sqlText, new RegExp(`\\b${column}\\b`), column)
            }
            if (sqlText.includes('question_library_v5_real')) {
              assert.match(sqlText, /questions?\.is_active\s*=\s*1|is_active\s*=\s*1/i)
            }
            if (sqlText.includes('question_library_v5_real') && sqlText.includes('LEFT JOIN')) {
              return {
                data: {
                  executeResultList: DB_STUB_OPTIONS.map(option => ({
                    question_key: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
                    question_text_cn: DB_STUB_WATERING_TEXT,
                    question_text_user_cn: DB_STUB_WATERING_TEXT,
                    question_type: 'single_choice',
                    target_symptom_key: 'leaf_yellowing',
                    question_group_key: 'db_mock_watering_group',
                    question_level: 1,
                    observability: 'medium',
                    allow_unknown: 1,
                    priority: 240,
                    help_text_cn: DB_STUB_WATERING_HELP,
                    why_this_question_cn: 'DB mock：为什么问这题',
                    data_status: 'audited',
                    review_status: 'audited',
                    option_question_key: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
                    option_key: option.optionKey,
                    option_text_cn: option.text,
                    option_text_user_cn: option.text,
                    maps_to_symptom_key: '',
                    value: 0,
                    association_strength: 0,
                    answer_effect_cn: '',
                    option_data_status: 'audited',
                    option_review_status: 'audited',
                    is_active: 1
                  }))
                }
              }
            }
            if (sqlText.includes('question_library_v5_real')) {
              return {
                data: {
                  executeResultList: [
                    {
                      question_key: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
                      question_text_cn: DB_STUB_WATERING_TEXT,
                      question_text_user_cn: DB_STUB_WATERING_TEXT,
                      question_type: 'single_choice',
                      target_symptom_key: 'leaf_yellowing',
                      question_group_key: 'db_mock_watering_group',
                      question_level: 1,
                      observability: 'medium',
                      allow_unknown: 1,
                      priority: 240,
                      help_text_cn: DB_STUB_WATERING_HELP,
                      why_this_question_cn: 'DB mock：为什么问这题',
                      data_status: 'audited',
                      review_status: 'audited'
                    }
                  ]
                }
              }
            }
            if (sqlText.includes('question_option_mapping_v5_real')) {
              return {
                data: {
                  executeResultList: DB_STUB_OPTIONS.map(option => ({
                    question_key: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
                    option_key: option.optionKey,
                    option_text_cn: option.text,
                    option_text_user_cn: option.text,
                    maps_to_symptom_key: '',
                    value: 0,
                    association_strength: 0,
                    answer_effect_cn: '',
                    data_status: 'audited',
                    review_status: 'audited',
                    is_active: 1
                  }))
                }
              }
            }
            return { data: { executeResultList: [] } }
          }
        }
      }
    }
    return originalLoad.apply(this, [request, parent, isMain])
  }

  try {
    const repository = require(repositoryPath)
    await repository.preloadQuestionRepositoryCache()
    const questionRows = await repository.getQuestionsByKeys([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    const optionRows = await repository.getQuestionOptionMappings([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    const packageRows = await repository.getQuestionPackageByKeys([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    assert.equal(questionRows.length, 1)
    assert.equal(optionRows.length, 2)
    assert.equal(packageRows.questions.length, 1)
    assert.equal(packageRows.optionRows.length, 2)
    const optionQueries = executedSql.filter(sql => sql.includes('question_option_mapping_v5_real'))
    assert.equal(optionQueries.length >= 2, true)
    for (const sql of optionQueries) {
      assert.match(sql, /is_active\s*=\s*1/i)
    }
  } finally {
    Module._load = originalLoad
    delete require.cache[repositoryPath]
  }
}

async function testQuestionRepositoryRefreshDropsRowsThatBecameInactive() {
  const repositoryPath = require.resolve('../../../../../cloudfunctions/diagnose-http/repositories/question-repository.js')
  const originalLoad = Module._load
  const previousStaticTtl = process.env.DIAGNOSE_STATIC_CACHE_TTL_MS
  const previousPackageTtl = process.env.DIAGNOSE_QUESTION_PACKAGE_CACHE_TTL_MS
  let preloadVersion = 0

  process.env.DIAGNOSE_STATIC_CACHE_TTL_MS = '1'
  process.env.DIAGNOSE_QUESTION_PACKAGE_CACHE_TTL_MS = '600000'
  delete require.cache[repositoryPath]
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return {
        models: {
          async $runSQL(sql) {
            const sqlText = String(sql || '')
            const isPreloadQuestionQuery =
              sqlText.includes('question_library_v5_real') &&
              sqlText.includes('ORDER BY priority DESC, question_key ASC')
            const isPreloadOptionQuery =
              sqlText.includes('question_option_mapping_v5_real') &&
              sqlText.includes('ORDER BY question_key ASC, option_key ASC')
            if (isPreloadQuestionQuery) {
              const rows = preloadVersion === 0
                ? [{
                    question_key: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
                    question_text_cn: DB_STUB_WATERING_TEXT,
                    question_text_user_cn: DB_STUB_WATERING_TEXT,
                    question_type: 'single_choice',
                    target_symptom_key: 'leaf_yellowing',
                    question_group_key: 'db_mock_watering_group',
                    question_level: 1,
                    observability: 'medium',
                    allow_unknown: 1,
                    priority: 240,
                    help_text_cn: DB_STUB_WATERING_HELP,
                    why_this_question_cn: 'DB mock：为什么问这题',
                    data_status: 'audited',
                    review_status: 'audited'
                  }]
                : []
              return { data: { executeResultList: rows } }
            }
            if (isPreloadOptionQuery) {
              const rows = preloadVersion === 0
                ? DB_STUB_OPTIONS.map(option => ({
                    question_key: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
                    option_key: option.optionKey,
                    option_text_cn: option.text,
                    option_text_user_cn: option.text,
                    maps_to_symptom_key: '',
                    value: 0,
                    association_strength: 0,
                    answer_effect_cn: '',
                    data_status: 'audited',
                    review_status: 'audited',
                    is_active: 1
                  }))
                : []
              return { data: { executeResultList: rows } }
            }
            if (sqlText.includes('question_library_v5_real') && sqlText.includes('LEFT JOIN')) {
              const rows = preloadVersion === 0
                ? DB_STUB_OPTIONS.map(option => ({
                    question_key: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
                    question_text_cn: DB_STUB_WATERING_TEXT,
                    question_text_user_cn: DB_STUB_WATERING_TEXT,
                    question_type: 'single_choice',
                    target_symptom_key: 'leaf_yellowing',
                    question_group_key: 'db_mock_watering_group',
                    question_level: 1,
                    observability: 'medium',
                    allow_unknown: 1,
                    priority: 240,
                    help_text_cn: DB_STUB_WATERING_HELP,
                    why_this_question_cn: 'DB mock：为什么问这题',
                    data_status: 'audited',
                    review_status: 'audited',
                    option_question_key: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
                    option_key: option.optionKey,
                    option_text_cn: option.text,
                    option_text_user_cn: option.text,
                    maps_to_symptom_key: '',
                    value: 0,
                    association_strength: 0,
                    answer_effect_cn: '',
                    option_data_status: 'audited',
                    option_review_status: 'audited',
                    is_active: 1
                  }))
                : []
              return { data: { executeResultList: rows } }
            }
            if (sqlText.includes('question_library_v5_real')) {
              return { data: { executeResultList: [] } }
            }
            return { data: { executeResultList: [] } }
          }
        }
      }
    }
    return originalLoad.apply(this, [request, parent, isMain])
  }

  try {
    const repository = require(repositoryPath)
    await repository.preloadQuestionRepositoryCache()
    const initialPackage = await repository.getQuestionPackageByKeys([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    assert.equal(initialPackage.questions.length, 1)
    assert.equal(initialPackage.optionRows.length, 2)

    await new Promise(resolve => setTimeout(resolve, 5))
    preloadVersion = 1
    await repository.preloadQuestionRepositoryCache()
    const refreshedQuestions = await repository.getQuestionsByKeys([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    const refreshedOptions = await repository.getQuestionOptionMappings([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    const refreshedPackage = await repository.getQuestionPackageByKeys([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    assert.equal(refreshedQuestions.length, 0)
    assert.equal(refreshedOptions.length, 0)
    assert.equal(refreshedPackage.questions.length, 0)
    assert.equal(refreshedPackage.optionRows.length, 0)
  } finally {
    Module._load = originalLoad
    delete require.cache[repositoryPath]
    if (previousStaticTtl === undefined) {
      delete process.env.DIAGNOSE_STATIC_CACHE_TTL_MS
    } else {
      process.env.DIAGNOSE_STATIC_CACHE_TTL_MS = previousStaticTtl
    }
    if (previousPackageTtl === undefined) {
      delete process.env.DIAGNOSE_QUESTION_PACKAGE_CACHE_TTL_MS
    } else {
      process.env.DIAGNOSE_QUESTION_PACKAGE_CACHE_TTL_MS = previousPackageTtl
    }
  }
}

await testQuestionRepositorySqlUsesCurrentSchemaColumns()
await testQuestionRepositoryRefreshDropsRowsThatBecameInactive()

console.log('question repository schema tests passed')
