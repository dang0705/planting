import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

/** 读取仓库内 UTF-8 事实源，缺失文件必须直接使合同测试失败。 */
function readFactSource(projectRootDirectory: string, relativePath: string): string {
  return fs.readFileSync(path.join(projectRootDirectory, relativePath), 'utf8')
}

/**
 * Expected 来源：用户确认“原子化环境因素是养护基础最重要的基石”，并结合既有
 * `care-capability-result/v1`、用户植物一等公民和室内/室外证据边界。
 * 测试层次：`unit_real_data`；回读真实架构、合同、数据字典、Phase 和 DDL 文件。
 * 明确未覆盖：环境采集运行时、算法实现、真实传感器/天气 Provider 与公开 API。
 */
describe('原子环境事实与派生指标架构合同', () => {
  const projectRootDirectory = findProjectRoot()

  test('业务与技术架构都以原子事实到派生指标再到养护能力为固定方向', () => {
    const rootArchitecture = readFactSource(projectRootDirectory, 'README.md')
    const businessArchitecture = readFactSource(projectRootDirectory, 'docs/backend-v2/architecture/business-domain.md')
    const technicalArchitecture = readFactSource(projectRootDirectory, 'docs/backend-v2/architecture/infrastructure.md')
    const masterPlan = readFactSource(projectRootDirectory, '青花植后端v2底层架构重构计划_融合闭环终版.md')

    for (const document of [rootArchitecture, businessArchitecture, technicalArchitecture, masterPlan]) {
      expect(document).toContain('原子环境事实')
      expect(document).toContain('派生环境指标')
    }
    expect(rootArchitecture).toContain('原子环境事实 --> 派生环境指标 --> 养护上下文')
    expect(rootArchitecture).toContain('室外天气不得冒充室内实测')
    expect(rootArchitecture).toContain('算法变化不得改写原子事实')
    expect(rootArchitecture).not.toContain('CareContext --> Diagnosis')
    expect(rootArchitecture).not.toContain('Weather --> Diagnosis')
    expect(rootArchitecture).toContain('EnvironmentSnapshot --> Diagnosis')
  })

  test('独立合同冻结来源、时间、单位、置信度和推导可回放边界', () => {
    const contract = readFactSource(projectRootDirectory, 'docs/backend-v2/contracts/care-environment-foundation.md')

    for (const requiredSemantics of [
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
      expect(contract).toContain(requiredSemantics)
    }
    expect(contract).toContain('不得把室外温湿度直接标记为室内或植物周围实测')
    expect(contract).toContain('不得把派生值回写为原子环境事实')
    expect(contract).toContain('基准周期不是最终浇水日期')
  })

  test('数据字典与 DDL 分离不可变观察、输入快照和派生结果', () => {
    const dataDictionary = readFactSource(projectRootDirectory, 'docs/backend-v2/data/v2-data-dictionary.md')
    const ddl = readFactSource(projectRootDirectory, 'docs/backend-v2/schema/004_care_diagnosis.sql')

    for (const tableName of [
      'care_environment_observations',
      'care_environment_snapshots',
      'care_environment_derivations'
    ]) {
      expect(dataDictionary).toContain(`\`${tableName}\``)
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

    for (const guestReplayField of [
      '`environment_contract_version`',
      '`input_manifest_json`',
      '`input_manifest_sha256`',
      '`algorithm_release_manifest_json`',
      '`algorithm_release_manifest_sha256`',
      '`derivations_json`',
      '`derivations_sha256`'
    ]) {
      expect(ddl).toContain(guestReplayField)
    }

    for (const immutableTrigger of [
      'trg_environment_observations_reject_update',
      'trg_environment_snapshots_reject_update',
      'trg_environment_derivations_reject_update',
      'trg_temporary_care_results_reject_update'
    ]) {
      expect(ddl).toContain(immutableTrigger)
    }
  })

  test('合同注册表与配置目录纳入环境基石的版本与硬规则', () => {
    const contractRegistry = readFactSource(projectRootDirectory, 'docs/backend-v2/contracts/contract-registry.json')
    const configDirectory = readFactSource(
      projectRootDirectory,
      'docs/backend-v2/architecture/configuration-variable-catalog.json'
    )

    expect(contractRegistry).toContain('care-environment-foundation')
    for (const configKey of [
      'care.environment.atomic_facts_immutable',
      'care.environment.weather_scope_must_be_outdoor',
      'care.environment.derivation_must_not_overwrite_fact',
      'care.environment.reference_conditions_release',
      'care.environment.derivation_algorithm_release'
    ]) {
      expect(configDirectory).toContain(configKey)
    }
  })

  test('P4 任务要求先建设环境事实层再实现四类养护算法', () => {
    const phase = readFactSource(projectRootDirectory, 'docs/backend-v2/phases/P4-care-diagnosis-agent.md')
    const ticket = readFactSource(projectRootDirectory, 'docs/backend-v2/clickup/ticket-specs.md')

    for (const document of [phase, ticket]) {
      expect(document).toContain('原子环境事实')
      expect(document).toContain('派生环境指标')
      expect(document).toContain('先事实、后推导、再建议')
    }
  })
})
