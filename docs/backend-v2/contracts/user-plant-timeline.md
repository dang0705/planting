# 用户植物时间线合同

- 合同版本：`user-plant-timeline/v1`
- 所有者：`user-plant`；所属票据：E03 / `z8v0kmr9mj`。
- 冻结：2026-10-10 用户审定（草案按推荐通过：异步写入、补录按实际发生时间排序、上线前历史浇水一次性回填，回填脚本只写文件不执行）。
- 路由：`GET /api/v2/user-plants/{userPlantRef}/timeline`（operationId `listUserPlantTimeline`，`authenticated`，只读）。
- 依据：`user-plant.md`「事实边界：时间线是投影视图，不是事实写入口」、`schema/003_user_plant.sql` 的 `user_plant_timeline_projection`
  （`uq_timeline_source(source_domain, source_ref)`、`summary_json` 脱敏摘要、`projection_version`）。

## 1. 第一期收录的事件

| itemType | 来源域 | 来源对象 | 写入时机 |
|---|---|---|---|
| `care_watering` | care | 用户确认的浇水事实 `cft_…` | care 事实提交后**异步**投影 |
| `care_plan_completed` | care | 已完成的检查计划 `cpl_…` | care 计划完成提交后**异步**投影 |
| `plant_archived` | user-plant | 归档命令 | 归档事务内同步写投影 |
| `plant_restored` | user-plant | 恢复命令 | 恢复事务内同步写投影 |

**不收**：建议、未确认计划、诊断结果、识别候选、档案字段变化、积分。

## 2. 写入规则

- 时间线只读，没有任何公开写接口；`deleting`/`deleted` 植物的时间线随植物对外不可见。
- care 来源采用**异步**投影：care 在自身事务内记录可靠事件，user-plant 消费后写投影；`uq_timeline_source` 保证重复投递只落一行。
  用户刚记录的浇水可能延迟数秒才出现在时间线（用户审定可接受）。
- 每行 `source_ref` 是来源对象不可变公开引用；`timeline_item_ref` 为 user-plant 生成的高熵公开引用 `tli_…`。

## 3. 查询与响应

```ts
/** 查询参数：与植物列表一致的游标分页，未知/重复/非法参数 400。 */
export type TimelineQuery = {
  /** 1～策略上限的十进制整数文本；缺省为策略默认（生效策略 user-plant/list_rules，当前 20 / 50，绝对上限 50；用户 2026-10-10 裁定，策略不可用 503）。 */
  limit?: string
  /** 只能原样回传上一页的 nextCursor。 */
  cursor?: string
}

export type TimelineItem = {
  /** 时间线项公开引用 tli_…。 */
  timelineItemRef: string
  itemType: 'care_watering' | 'care_plan_completed' | 'plant_archived' | 'plant_restored'
  /** 业务实际发生时间（浇水补录按用户填写的实际时间）。 */
  occurredAt: string
  /** 按类型区分的脱敏摘要。 */
  summary:
    | { itemType: 'care_watering'; amountMl: number | null }
    | { itemType: 'care_plan_completed'; outcome: 'done' }
    | { itemType: 'plant_archived' }
    | { itemType: 'plant_restored' }
}

export type TimelineResponse = { items: TimelineItem[]; nextCursor: string | null }
```

- 排序：`occurredAt` 倒序，同刻按 `timelineItemRef` 二进制倒序（补录的历史浇水按实际时间插到对应位置）。
- 成功 `200 { "data": TimelineResponse }`；空时间线返回空列表；跨用户/不存在/删除中统一 `404 USER_PLANT_NOT_FOUND`。
- 摘要不含来源内部引用、`user_id`、模型输出或用户备注原文。

## 4. 上线前历史回填

上线前已存在的浇水事实与已完成计划一次性回填为时间线投影。回填以可回放脚本 `cloudfunctions-v2/scripts/backfill-user-plant-timeline.sql` 交付（只写入仓库文件、由人工在获批窗口执行），
按 `uq_timeline_source` 幂等，可重复执行不产生重复行；脚本执行前后核对来源行数与投影行数。

## 5. 异步投影：事件与派发（2026-10-10 用户裁决，主代理裁定 hard_rule）

- **事件类型**：care 在记录浇水事实、完成检查计划（`outcome=done`）的同一事务内向 `care_outbox` 追加一条 pending 事件：
  - `care.watering_fact_recorded.v1`：`aggregateRef=occurrenceRef=factRef`，`occurredAt`=浇水实际发生时间，载荷 `{ factRef, occurredAt, amountMl }`；
  - `care.plan_completed.v1`：`aggregateRef=occurrenceRef=planRef`，`occurredAt`=完成时刻，载荷 `{ planRef, completedAt }`。
  迁移 `029_care_outbox_timeline_event_types.sql` 只放开 `ck_care_outbox_event_type` 的取值（只写文件，由人工在获批窗口执行）。
- **派发方式**（2026-10-10 用户裁决，替代原“每分钟一次的 `care-outbox-dispatch`”，原因：测试库 TDSQL-C Serverless 按醒着时长计费，每分钟任务使其无法休眠）：
  1. 写入时顺带派发：care 写请求提交后在同一请求内对本请求新写入的事件尽力派发一次（最长 1.5 秒，见 long-term-care-contract.md §13）。成功时**时间线立即可见**。
  2. 低频补扫：care 域事件函数 `care-maintenance-sweep`（Nodejs20.19、Handler `index.main`、cron `0 25 0,4,7,11,14,16,19,21 * * * *`）
     补派失败或超时的事件；最坏情况下时间线最长约 4 小时后可见。
  两者只领取上述两类时间线事件（奖励事件留给 subscription 派发，不在此处理）。
- **派发规则**（配置目录 `care.outbox_dispatch`，hard_rule）：每次运行领取一批最多 **100** 条；领取即加 **30 秒**租约并 `attempt_count+1`；
  投递成功 → `delivered`；投递失败 → 回到 `pending`，下一次运行重试；第 **5** 次尝试仍失败 → `dead_letter`（`terminal_reason_code=delivery_failed`）；
  租约过期仍处于 `dispatching` 的事件可被下一次运行接管（尝试次数已达 5 次则直接 `dead_letter`，`terminal_reason_code=lease_expired_max_attempts`）。
- **投递**：调用 user-plant 时间线投影写入；`uq_timeline_source(source_domain, source_ref)` 保证重复投递只落一行（至少一次投递 + 幂等消费）。
- **时间线项引用**：`timeline_item_ref = 'tli_' + SHA-256("{source_domain}:{source_ref}") 前 40 位十六进制`，确定性生成，回填脚本与派发使用同一规则。
- **归档/恢复**：user-plant 在归档/恢复的同一事务内直接写投影，`source_ref = 'ulc_' + SHA-256("{user_plant_id}:{新版本}") 前 40 位`。

## 6. 错误集合

`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`SERVICE_UNAVAILABLE`。
