# 用户植物时间线合同（草案，待用户审）

- 所属票据：E03 / `z8v0kmr9mj`；起草：2026-10-10（用户裁决 B：第一期只收养护确认后的事实与归档/恢复，只读，事件写入）。
- 状态：**草案，待用户审**。不实现、不建 DDL。
- 已登记路由：`GET /api/v2/user-plants/{userPlantRef}/timeline`（operationId `listUserPlantTimeline`，只读）。
- 依据：`docs/backend-v2/contracts/user-plant.md`「事实边界：时间线是投影视图，不是事实写入口」；
  `schema/003_user_plant.sql` 的 `user_plant_timeline_projection`（`uq_timeline_source(source_domain, source_ref)`、`summary_json` 脱敏摘要、`projection_version`）。

## 1. 第一期收录的事件

| item_type | 来源域 | 来源对象 | 何时写入 |
|---|---|---|---|
| `care_watering` | care | 浇水事实 `cft_…`（用户确认实际浇了） | care 事实提交后，经 care 事件写入 |
| `care_plan_completed` | care | 已完成的检查计划 `cpl_…` | 计划完成提交后 |
| `plant_archived` | user-plant | 归档命令结果 | 归档事务内 |
| `plant_restored` | user-plant | 恢复命令结果 | 恢复事务内 |

**不收**：建议、未确认计划、诊断结果、识别候选、档案字段变化、积分（避免把“建议”误当“事实”）。

## 2. 写入方式（推荐：同库事件投影，待确认 Q1）

- user-plant 自己的归档/恢复：在同一事务直接写投影行（来源引用 = 幂等命令的公开结果引用）。
- care 的事实与计划完成：care 在自己事务内写 `care_outbox`，user-plant 消费后写投影；`uq_timeline_source` 保证重复投递只落一行（像前端按 id 去重渲染列表）。
- 时间线只读，没有任何公开写接口；删除植物（deleting）后时间线随植物一起对外不可见。

## 3. 查询 DTO（草案）

```ts
/** 查询参数：与植物列表一致的游标分页。 */
export type TimelineQuery = {
  limit?: string   // 1～50，缺省 20（推荐复用 user-plant.list.page_size 硬规则，或单独登记，见 Q3）
  cursor?: string  // 不透明游标
}

export type TimelineItem = {
  timelineItemRef: string        // tli_… 公开引用
  itemType: 'care_watering' | 'care_plan_completed' | 'plant_archived' | 'plant_restored'
  occurredAt: string             // 业务发生时间（浇水按用户填写的实际时间）
  summary: TimelineSummary       // 按 itemType 区分的脱敏摘要，见下
}

export type TimelineSummary =
  | { itemType: 'care_watering'; amountMl: number | null }
  | { itemType: 'care_plan_completed'; outcome: 'done' }
  | { itemType: 'plant_archived' }
  | { itemType: 'plant_restored' }

export type TimelineResponse = { items: TimelineItem[]; nextCursor: string | null }
```

- 排序：`occurredAt` 倒序，同刻按 `timelineItemRef` 二进制倒序。
- 摘要只含展示所需字段，不含来源内部引用、`user_id`、模型输出或备注原文。

## 4. 需要用户拍板

- Q1：care 事件经 outbox 异步写入，用户刚浇完水可能有几秒才出现在时间线；能否接受？（另一种是 care 直接同事务写 user-plant 的表，但会打破“各域只写自己的表”。）推荐异步。
- Q2：浇水补录（用户填 3 天前浇过）按“实际发生时间”排还是按“记录时间”排？推荐实际发生时间。
- Q3：时间线分页是否直接复用 `user-plant.list.page_size`（20/50）？推荐单独登记同值的 `user-plant.timeline.page_size`，便于将来分开调。
- Q4：历史数据回填：上线前已有的浇水事实是否一次性回填到时间线？推荐回填（一次性迁移脚本，可回放）。
