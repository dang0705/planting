import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data（L1，只读真实迁移文件）。Expected：docs/backend-v2/contracts/user-plant-timeline.md §5（2026-10-10 用户裁决）：
 * 029 只放开 care_outbox 的事件类型约束，新增 care.watering_fact_recorded.v1 / care.plan_completed.v1，保留两类奖励事件；
 * 不建表、不改列、不写数据；manifest 顺序紧接 028。
 */
const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
const read = (file: string) => fs.readFileSync(path.join(schemaDirectory, file), 'utf8')
const strip = (text: string) => text.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')

describe('迁移 029：care_outbox 时间线事件类型', () => {
  it('manifest 紧接 028 登记 029，owner=care', () => {
    const manifest = JSON.parse(read('manifest.json')) as { files: Array<{ order: number; owner: string; file: string }> }
    const previous = manifest.files.find(entry => entry.file === '028_care_plan_expiry_scan_index.sql')!
    const entry = manifest.files.find(entry => entry.file === '029_care_outbox_timeline_event_types.sql')
    expect(entry).toMatchObject({ owner: 'care', order: previous.order + 1 })
  })

  it('只替换 ck_care_outbox_event_type，取值为两类奖励事件 + 两类时间线事件', () => {
    const content = strip(read('029_care_outbox_timeline_event_types.sql'))
    expect([...content.matchAll(/ALTER TABLE `([a-z_]+)`/gu)].map(match => match[1])).toEqual(['care_outbox'])
    expect([...content.matchAll(/DROP CHECK `([a-z_]+)`/gu)].map(match => match[1])).toEqual(['ck_care_outbox_event_type'])
    const added = content.match(/ADD CONSTRAINT `ck_care_outbox_event_type` CHECK \(`event_type` IN \(([^)]*)\)\)/u)
    expect(added?.[1]?.split(',').map(value => value.trim().replaceAll("'", '')).sort()).toEqual([
      'care.fertilizing_check_completed.v1', 'care.plan_completed.v1', 'care.soil_check_completed.v1', 'care.watering_fact_recorded.v1'
    ])
    expect(content).not.toMatch(/\bCREATE TABLE\b|\bDROP COLUMN\b|\bDROP TABLE\b|\bMODIFY\b|\bRENAME\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTIMESTAMP\b/u)
  })
})
