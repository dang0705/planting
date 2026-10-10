-- 029：care 发件箱放开时间线事件类型（user-plant-timeline.md §5，用户 2026-10-10 裁决时间线异步派发）。
-- 在 006 建表后执行；只替换 ck_care_outbox_event_type 的取值，保留两类奖励事件，不改列、不搬迁记录。
-- 新增：care.watering_fact_recorded.v1（浇水事实）、care.plan_completed.v1（检查计划完成），由 care-outbox-dispatch 事件函数投递给 user-plant 时间线。
-- 切换条件：约束已替换且 information_schema.CHECK_CONSTRAINTS 读回四个取值；回退：停用 care-outbox-dispatch 定时触发器、确认无新类型事件后由 DBA 另行批准恢复原约束。
-- 只写文件：由人工在获批窗口执行，不在 HTTP 函数启动时执行。
ALTER TABLE `care_outbox`
  DROP CHECK `ck_care_outbox_event_type`,
  ADD CONSTRAINT `ck_care_outbox_event_type` CHECK (`event_type` IN ('care.soil_check_completed.v1', 'care.fertilizing_check_completed.v1', 'care.watering_fact_recorded.v1', 'care.plan_completed.v1'));
