import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

/** 读取仓库内 UTF-8 事实源，缺失文件必须直接使合同测试失败。 */
function 读取事实源(项目根目录: string, 相对路径: string): string {
  return fs.readFileSync(path.join(项目根目录, 相对路径), 'utf8')
}

/**
 * Expected 来源：用户确认“原子化环境因素是养护基础最重要的基石”，并结合既有
 * `care-capability-result/v1`、用户植物一等公民和室内/室外证据边界。
 * 测试层次：`unit_real_data`；回读真实架构、合同、数据字典、Phase 和 DDL 文件。
 * 明确未覆盖：环境采集运行时、算法实现、真实传感器/天气 Provider 与公开 API。
 */
describe('原子环境事实与派生指标架构合同', () => {
  const 项目根目录 = findProjectRoot()

  test('业务与技术架构都以原子事实到派生指标再到养护能力为固定方向', () => {
    const 根架构 = 读取事实源(项目根目录, 'README.md')
    const 业务架构 = 读取事实源(项目根目录, 'docs/backend-v2/architecture/business-domain.md')
    const 技术架构 = 读取事实源(项目根目录, 'docs/backend-v2/architecture/infrastructure.md')
    const 主计划 = 读取事实源(项目根目录, '青花植后端v2底层架构重构计划_融合闭环终版.md')

    for (const 文档 of [根架构, 业务架构, 技术架构, 主计划]) {
      expect(文档).toContain('原子环境事实')
      expect(文档).toContain('派生环境指标')
    }
    expect(根架构).toContain('原子环境事实 --> 派生环境指标 --> 养护上下文')
    expect(根架构).toContain('室外天气不得冒充室内实测')
    expect(根架构).toContain('算法变化不得改写原子事实')
    expect(根架构).not.toContain('CareContext --> Diagnosis')
    expect(根架构).not.toContain('Weather --> Diagnosis')
    expect(根架构).toContain('EnvironmentSnapshot --> Diagnosis')
  })

  test('独立合同冻结来源、时间、单位、置信度和推导可回放边界', () => {
    const 合同 = 读取事实源(项目根目录, 'docs/backend-v2/contracts/care-environment-foundation.md')

    for (const 必须语义 of [
      'care-environment-foundation/v1',
      '光照',
      '空气温度',
      '相对湿度',
      '空气运动',
      '盆器',
      '基质',
      '排水',
      '盆土表面',
      'VPD',
      '预计干湿周期',
      'observedAt',
      'validUntil',
      'sourceScope',
      'unitCode',
      'confidence',
      'inputSnapshotHash',
      'algorithmRelease'
    ]) {
      expect(合同).toContain(必须语义)
    }
    expect(合同).toContain('不得把室外温湿度直接标记为室内或植物周围实测')
    expect(合同).toContain('不得把派生值回写为原子环境事实')
    expect(合同).toContain('基准周期不是最终浇水日期')
  })

  test('数据字典与 DDL 分离不可变观察、输入快照和派生结果', () => {
    const 数据字典 = 读取事实源(项目根目录, 'docs/backend-v2/data/v2-data-dictionary.md')
    const ddl = 读取事实源(项目根目录, 'docs/backend-v2/schema/004_care_diagnosis.sql')

    for (const tableName of [
      'care_environment_observations',
      'care_environment_snapshots',
      'care_environment_derivations'
    ]) {
      expect(数据字典).toContain(`\`${tableName}\``)
      expect(ddl).toContain(`CREATE TABLE \`${tableName}\``)
    }
    for (const requiredColumn of [
      '`factor_type`',
      '`source_scope`',
      '`unit_code`',
      '`observed_at_ms`',
      '`valid_until_ms`',
      '`input_manifest_sha256`',
      '`derivation_type`',
      '`algorithm_release_ref`',
      '`result_sha256`'
    ]) {
      expect(ddl).toContain(requiredColumn)
    }

    for (const 游客回放字段 of [
      '`environment_contract_version`',
      '`input_manifest_json`',
      '`input_manifest_sha256`',
      '`algorithm_release_manifest_json`',
      '`algorithm_release_manifest_sha256`',
      '`derivations_json`',
      '`derivations_sha256`'
    ]) {
      expect(ddl).toContain(游客回放字段)
    }

    for (const 不可变触发器 of [
      'trg_environment_observations_reject_update',
      'trg_environment_snapshots_reject_update',
      'trg_environment_derivations_reject_update',
      'trg_temporary_care_results_reject_update'
    ]) {
      expect(ddl).toContain(不可变触发器)
    }
  })

  test('合同注册表与配置目录纳入环境基石的版本与硬规则', () => {
    const 合同注册表 = 读取事实源(项目根目录, 'docs/backend-v2/contracts/contract-registry.json')
    const 配置目录 = 读取事实源(
      项目根目录,
      'docs/backend-v2/architecture/configuration-variable-catalog.json'
    )

    expect(合同注册表).toContain('care-environment-foundation')
    for (const 配置键 of [
      'care.environment.atomic_facts_immutable',
      'care.environment.weather_scope_must_be_outdoor',
      'care.environment.derivation_must_not_overwrite_fact',
      'care.environment.reference_conditions_release',
      'care.environment.derivation_algorithm_release'
    ]) {
      expect(配置目录).toContain(配置键)
    }
  })

  test('P4 任务要求先建设环境事实层再实现四类养护算法', () => {
    const phase = 读取事实源(项目根目录, 'docs/backend-v2/phases/P4-care-diagnosis-agent.md')
    const ticket = 读取事实源(项目根目录, 'docs/backend-v2/clickup/ticket-specs.md')

    for (const 文档 of [phase, ticket]) {
      expect(文档).toContain('原子环境事实')
      expect(文档).toContain('派生环境指标')
      expect(文档).toContain('先事实、后推导、再建议')
    }
  })
})
