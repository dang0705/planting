-- 用户植物时间线上线前一次性回填（docs/backend-v2/contracts/user-plant-timeline.md §4，用户 2026-10-10 裁决）。
-- 只写文件、不自动执行：由人工在获批窗口对目标库执行；不在 HTTP 函数启动或部署流程中执行。
-- 幂等：timeline_item_ref 与派发同一规则（'tli_' + SHA-256("{source_domain}:{source_ref}") 前 40 位），
--       uq_timeline_source(source_domain, source_ref) 已存在则跳过（INSERT IGNORE），可重复执行。
-- 核对：执行前后各运行文末两条 SELECT，投影中 care 来源行数应等于“浇水事实 + 已完成计划”行数。
-- 回退：DELETE 本脚本插入的行须另行审批（按 source_domain='care' 且 created_at_ms = 执行时刻范围定位），本脚本不提供删除。

SET @backfill_at_ms = CAST(UNIX_TIMESTAMP(NOW(3)) * 1000 AS UNSIGNED);

-- 1. 浇水事实 → care_watering（发生时间 = 用户填写的实际浇水时间）
INSERT IGNORE INTO user_plant_timeline_projection
  (timeline_item_ref, user_internal_id, user_plant_internal_id, source_domain, source_ref, item_type, occurred_at_ms, summary_json, projection_version, created_at_ms, updated_at_ms)
SELECT CONCAT('tli_', LEFT(SHA2(CONCAT('care:', f.fact_ref), 256), 40)), f.user_internal_id, f.user_plant_internal_id, 'care', f.fact_ref, 'care_watering',
       f.occurred_at_ms, JSON_OBJECT('itemType', 'care_watering', 'amountMl', JSON_EXTRACT(f.fact_payload_json, '$.amountMl')), 1, @backfill_at_ms, @backfill_at_ms
FROM care_facts f
WHERE f.fact_type = 'watering' AND f._openid = '';

-- 2. 已完成检查计划 → care_plan_completed（发生时间 = 计划最后更新时间，即完成时刻）
INSERT IGNORE INTO user_plant_timeline_projection
  (timeline_item_ref, user_internal_id, user_plant_internal_id, source_domain, source_ref, item_type, occurred_at_ms, summary_json, projection_version, created_at_ms, updated_at_ms)
SELECT CONCAT('tli_', LEFT(SHA2(CONCAT('care:', p.plan_ref), 256), 40)), p.user_internal_id, p.user_plant_internal_id, 'care', p.plan_ref, 'care_plan_completed',
       p.updated_at_ms, JSON_OBJECT('itemType', 'care_plan_completed', 'outcome', 'done'), 1, @backfill_at_ms, @backfill_at_ms
FROM care_plans p
WHERE p.status = 'completed' AND p._openid = '';

-- 核对（只读）
SELECT COUNT(*) AS care_projection_rows FROM user_plant_timeline_projection WHERE source_domain = 'care';
SELECT (SELECT COUNT(*) FROM care_facts WHERE fact_type = 'watering') + (SELECT COUNT(*) FROM care_plans WHERE status = 'completed') AS care_source_rows;
