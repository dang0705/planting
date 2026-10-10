import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'

/**
 * care 发件箱派发规则（docs/backend-v2/contracts/user-plant-timeline.md §5；配置目录 `care.outbox_dispatch`）。
 * 用户 2026-10-10 裁决、主代理裁定为不可配置硬规则：由本常量 + 目录一致性测试 + 合同共同保证，运行时不读取目录。
 *
 * 通俗说明：像前端的“消息队列轮询”——每分钟取最多 100 条待投递的事件，每条先“占座”30 秒，
 * 投递成功就打勾；失败就放回去下次再试，试满 5 次还不行就放进“死信箱”等人工处理。
 *
 * 字段：cron（CloudBase 7 段，部署时触发器必须一致）、leaseSeconds（领取后租约秒数）、batchSize（单次最多领取条数）、
 * maxAttempts（第 maxAttempts 次仍失败进入死信）。取值只在代码层注册表 `RUNTIME_PARAMETERS.care.outboxDispatch` 定义，不允许环境变量覆盖。
 */
export const CARE_OUTBOX_DISPATCH = RUNTIME_PARAMETERS.care.outboxDispatch.value

/** 由 care-outbox-dispatch 投递给 user-plant 时间线的事件类型；奖励事件不在此处理。 */
export const CARE_TIMELINE_EVENT_TYPES = Object.freeze(['care.watering_fact_recorded.v1', 'care.plan_completed.v1'] as const)

/** 时间线事件类型。 */
export type CareTimelineEventType = (typeof CARE_TIMELINE_EVENT_TYPES)[number]
