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
  /** 1～50 的十进制整数文本；缺省 20（硬规则 user-plant.timeline.page_size）。 */
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

上线前已存在的浇水事实与已完成计划一次性回填为时间线投影。回填以可回放脚本交付（只写入仓库文件、由人工在获批窗口执行），
按 `uq_timeline_source` 幂等，可重复执行不产生重复行；脚本执行前后核对来源行数与投影行数。

## 5. 实施前须由主代理/用户确认的技术项（不改变本合同的业务语义）

- **care 可靠事件类型**：现有 `care_outbox` 的 `ck_care_outbox_event_type` 只允许两类奖励事件；时间线需要新增
  `care.watering_fact_recorded.v1`、`care.plan_completed.v1` 两类事件，须新增顺序迁移（DDL 029）并修订 `reward-events` 以外的事件目录。
- **派发运行形态**：仓库尚无任何 outbox dispatcher；需确定以定时云函数还是同函数内异步任务派发，以及租约/批量/重试数值（须登记配置目录）。

## 6. 错误集合

`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`SERVICE_UNAVAILABLE`。
