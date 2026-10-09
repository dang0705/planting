-- watering_baseline_policy v1 种子（主代理 2026-10-09 裁决 A2）：22 行，按测试库 qinghuazhi_v2_test 的 id 顺序逐字抄录
-- （tier、trigger_state、min_days、max_days；全部 policy_version='v1'、is_active=1）。
-- 不属于 schema manifest 的 DDL；新环境与本地隔离 MySQL 在执行 024 建表后单独执行本文件。测试库已有同数据，不在测试库重放。
-- created_at_ms/updated_at_ms 统一取 2026-10-09T00:00:00Z（种子登记日），不代表测试库原始创建时间。
INSERT INTO `watering_baseline_policy` (`policy_version`, `water_frequency_tier`, `trigger_state`, `min_days`, `max_days`, `is_active`, `created_at_ms`, `updated_at_ms`) VALUES
  ('v1', 'constant_moisture', 'KEEP_WET', 1, 3, 1, 1791504000000, 1791504000000),
  ('v1', 'constant_moisture', 'KEEP_MOIST', 2, 4, 1, 1791504000000, 1791504000000),
  ('v1', 'regular', 'KEEP_WET', 3, 5, 1, 1791504000000, 1791504000000),
  ('v1', 'regular', 'KEEP_MOIST', 4, 7, 1, 1791504000000, 1791504000000),
  ('v1', 'regular', 'SURFACE_DRY', 5, 8, 1, 1791504000000, 1791504000000),
  ('v1', 'regular', 'DRY_WET', 7, 14, 1, 1791504000000, 1791504000000),
  ('v1', 'occasional', 'DRY_WET', 10, 16, 1, 1791504000000, 1791504000000),
  ('v1', 'occasional', 'FULL_DRY', 14, 21, 1, 1791504000000, 1791504000000),
  ('v1', 'occasional', 'VERY_DRY', 18, 24, 1, 1791504000000, 1791504000000),
  ('v1', 'occasional', 'DROUGHT_SIGNAL', 12, 18, 1, 1791504000000, 1791504000000),
  ('v1', 'drought_tolerant', 'DROUGHT_SIGNAL', 14, 21, 1, 1791504000000, 1791504000000),
  ('v1', 'drought_tolerant', 'FULL_DRY', 14, 21, 1, 1791504000000, 1791504000000),
  ('v1', 'drought_tolerant', 'VERY_DRY', 21, 30, 1, 1791504000000, 1791504000000),
  ('v1', 'constant_moisture', 'TIER_DEFAULT', 1, 4, 1, 1791504000000, 1791504000000),
  ('v1', 'constant_moisture', 'SURFACE_DRY', 2, 5, 1, 1791504000000, 1791504000000),
  ('v1', 'constant_moisture', 'DRY_WET', 3, 7, 1, 1791504000000, 1791504000000),
  ('v1', 'regular', 'TIER_DEFAULT', 5, 12, 1, 1791504000000, 1791504000000),
  ('v1', 'regular', 'FULL_DRY', 10, 16, 1, 1791504000000, 1791504000000),
  ('v1', 'regular', 'VERY_DRY', 14, 21, 1, 1791504000000, 1791504000000),
  ('v1', 'occasional', 'TIER_DEFAULT', 10, 18, 1, 1791504000000, 1791504000000),
  ('v1', 'occasional', 'SURFACE_DRY', 8, 12, 1, 1791504000000, 1791504000000),
  ('v1', 'drought_tolerant', 'TIER_DEFAULT', 14, 24, 1, 1791504000000, 1791504000000);
