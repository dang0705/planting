-- 028：检查计划过期扫描索引（long-term-care/v1 §12.7，用户 2026-10-09 裁决「定时任务写入过期」）。
-- 在 004 建表后执行；只新增二级索引，不改列、不搬迁记录、不改写既有约束。
-- 用途：care-plan-expiry 事件函数按 status='planned' AND scheduled_at_ms < 截止 ORDER BY scheduled_at_ms, id LIMIT 500 分批扫描；
-- 既有 idx_care_plan_due 以 user_internal_id 开头，不能支撑跨用户全局扫描。
-- 切换条件：索引存在且 EXPLAIN 显示扫描语句使用本索引；回退：停用定时触发器后由 DBA 另行批准删除本索引（不影响业务读写）。
CREATE INDEX `idx_care_plan_expiry_scan` ON `care_plans` (`status`, `scheduled_at_ms`, `id`);
