-- QA cloud1_dev only: indexes for auth/user and user-plants direct-read paths.
-- The statements are intentionally idempotent so the same migration can be
-- replayed after a failed deployment without duplicating indexes.

SET @schema_name = 'cloud1_dev';

SET @table_name = 'user_plant_instances';
SET @index_name = 'idx_user_plant_openid_created_id';
SET @index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @sql = IF(
  @index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @schema_name, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (_openid, created_at, id)'
  ),
  CONCAT('SELECT ''', @schema_name, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @table_name = 'plant_identity_entities';
SET @index_name = 'idx_identity_session_active';
SET @index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @sql = IF(
  @index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @schema_name, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (session_plant_id, is_active)'
  ),
  CONCAT('SELECT ''', @schema_name, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @table_name = 'diagnosis_sessions';
SET @index_name = 'idx_diagnosis_openid_plant_created_id';
SET @index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @sql = IF(
  @index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @schema_name, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (_openid, user_plant_id, created_at, diagnosis_id)'
  ),
  CONCAT('SELECT ''', @schema_name, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @table_name = 'user_fertilization_reminder_events';
SET @index_name = 'idx_fertilization_openid_plant_status_created_id';
SET @index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @sql = IF(
  @index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @schema_name, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (_openid, user_plant_id, status, created_at, id)'
  ),
  CONCAT('SELECT ''', @schema_name, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
