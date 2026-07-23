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
    'is_default',
    'is_active'
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
                    review_status: 'audited'
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
    const questionRows = await repository.getQuestionsByKeys([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    const optionRows = await repository.getQuestionOptionMappings([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY])
    assert.equal(questionRows.length, 1)
    assert.equal(optionRows.length, 2)
    assert.equal(executedSql.length >= 2, true)
  } finally {
    Module._load = originalLoad
    delete require.cache[repositoryPath]
  }
}

await testQuestionRepositorySqlUsesCurrentSchemaColumns()

console.log('question repository schema tests passed')
