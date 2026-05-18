-- Idempotent migration for review list/detail/images performance.
-- Keep dev and production schemas aligned because diagnose-http resolves schema by x-app-env.

SET @prod_schema = 'cloud1-2grufevs395a9d5e';
SET @dev_schema = 'cloud1_dev';
SET @table_name = 'visual_raw_image_records';
SET @index_name = 'idx_visual_raw_session_order';

SET @prod_index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @prod_schema
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @prod_sql = IF(
  @prod_index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @prod_schema, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (session_id, input_slot_order, created_at)'
  ),
  CONCAT('SELECT ''', @prod_schema, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE prod_stmt FROM @prod_sql;
EXECUTE prod_stmt;
DEALLOCATE PREPARE prod_stmt;

SET @dev_index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dev_schema
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @dev_sql = IF(
  @dev_index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @dev_schema, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (session_id, input_slot_order, created_at)'
  ),
  CONCAT('SELECT ''', @dev_schema, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;

SET @table_name = 'diagnosis_sessions';
SET @index_name = 'idx_diagnosis_sessions_created_at';

SET @prod_index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @prod_schema
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @prod_sql = IF(
  @prod_index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @prod_schema, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (created_at)'
  ),
  CONCAT('SELECT ''', @prod_schema, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE prod_stmt FROM @prod_sql;
EXECUTE prod_stmt;
DEALLOCATE PREPARE prod_stmt;

SET @dev_index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dev_schema
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @dev_sql = IF(
  @dev_index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @dev_schema, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (created_at)'
  ),
  CONCAT('SELECT ''', @dev_schema, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;

SET @index_name = 'idx_diagnosis_sessions_outcome_created';

SET @prod_index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @prod_schema
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @prod_sql = IF(
  @prod_index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @prod_schema, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (outcome_type, created_at)'
  ),
  CONCAT('SELECT ''', @prod_schema, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE prod_stmt FROM @prod_sql;
EXECUTE prod_stmt;
DEALLOCATE PREPARE prod_stmt;

SET @dev_index_exists = (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dev_schema
    AND TABLE_NAME = @table_name
    AND INDEX_NAME = @index_name
);
SET @dev_sql = IF(
  @dev_index_exists = 0,
  CONCAT(
    'ALTER TABLE `', @dev_schema, '`.`', @table_name, '` ',
    'ADD INDEX `', @index_name, '` (outcome_type, created_at)'
  ),
  CONCAT('SELECT ''', @dev_schema, '.', @index_name, ' already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;
