-- 施肥 P1：健康暂缓状态与用户补录日期。
-- 本脚本只允许执行 cloud1_dev，不包含生产库语句。

SET @has_fertilization_guard_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cloud1_dev'
    AND TABLE_NAME = 'user_plant_instances'
    AND COLUMN_NAME = 'fertilization_guard_json'
);
SET @add_fertilization_guard_sql := IF(
  @has_fertilization_guard_column = 0,
  'ALTER TABLE `cloud1_dev`.`user_plant_instances` ADD COLUMN `fertilization_guard_json` JSON NULL COMMENT ''施肥暂缓状态，由明确诊断结果生成；过期后读取时解除'' AFTER `pot_profile_confidence`',
  'SELECT 1'
);
PREPARE add_fertilization_guard_statement FROM @add_fertilization_guard_sql;
EXECUTE add_fertilization_guard_statement;
DEALLOCATE PREPARE add_fertilization_guard_statement;

SET @has_last_date_source_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cloud1_dev'
    AND TABLE_NAME = 'user_fertilization_reminder_events'
    AND COLUMN_NAME = 'last_date_source'
);
SET @alter_last_date_source_sql := IF(
  @has_last_date_source_column = 1,
  'ALTER TABLE `cloud1_dev`.`user_fertilization_reminder_events` MODIFY COLUMN `last_date_source` VARCHAR(16) NULL COMMENT ''recorded/user_asserted/estimated''',
  'SELECT 1'
);
PREPARE alter_last_date_source_statement FROM @alter_last_date_source_sql;
EXECUTE alter_last_date_source_statement;
DEALLOCATE PREPARE alter_last_date_source_statement;
