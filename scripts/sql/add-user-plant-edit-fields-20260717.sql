-- Add nullable user-editable fields for plant edit form.
-- TDSQL/MySQL in this project does not support column-exists DDL shortcuts,
-- so each field is guarded through information_schema + dynamic SQL.
-- Idempotent only: no backfill, no destructive operation, no historical data rewrite.

SET @prod_schema = 'cloud1-2grufevs395a9d5e';
SET @dev_schema = 'cloud1_dev';
SET @table_name = 'user_plant_instances';

SET @column_name = 'plant_date';
SET @prod_column_exists = (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @prod_schema
    AND TABLE_NAME = @table_name
    AND COLUMN_NAME = @column_name
);
SET @prod_sql = IF(
  @prod_column_exists = 0,
  CONCAT(
    'ALTER TABLE `', @prod_schema, '`.`', @table_name, '` ',
    'ADD COLUMN `plant_date` DATE NULL COMMENT ''用户填写的种植日期，YYYY-MM-DD 语义；缺失时保持 NULL'' AFTER `location`'
  ),
  CONCAT('SELECT ''', @prod_schema, '.user_plant_instances.plant_date already exists'' AS migration_status')
);
PREPARE prod_stmt FROM @prod_sql;
EXECUTE prod_stmt;
DEALLOCATE PREPARE prod_stmt;

SET @dev_column_exists = (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dev_schema
    AND TABLE_NAME = @table_name
    AND COLUMN_NAME = @column_name
);
SET @dev_sql = IF(
  @dev_column_exists = 0,
  CONCAT(
    'ALTER TABLE `', @dev_schema, '`.`', @table_name, '` ',
    'ADD COLUMN `plant_date` DATE NULL COMMENT ''用户填写的种植日期，YYYY-MM-DD 语义；缺失时保持 NULL'' AFTER `location`'
  ),
  CONCAT('SELECT ''', @dev_schema, '.user_plant_instances.plant_date already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;

SET @column_name = 'notes';
SET @prod_column_exists = (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @prod_schema
    AND TABLE_NAME = @table_name
    AND COLUMN_NAME = @column_name
);
SET @prod_sql = IF(
  @prod_column_exists = 0,
  CONCAT(
    'ALTER TABLE `', @prod_schema, '`.`', @table_name, '` ',
    'ADD COLUMN `notes` VARCHAR(200) NULL COMMENT ''用户填写的植物备注，最多 200 字'' AFTER `plant_date`'
  ),
  CONCAT('SELECT ''', @prod_schema, '.user_plant_instances.notes already exists'' AS migration_status')
);
PREPARE prod_stmt FROM @prod_sql;
EXECUTE prod_stmt;
DEALLOCATE PREPARE prod_stmt;

SET @dev_column_exists = (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dev_schema
    AND TABLE_NAME = @table_name
    AND COLUMN_NAME = @column_name
);
SET @dev_sql = IF(
  @dev_column_exists = 0,
  CONCAT(
    'ALTER TABLE `', @dev_schema, '`.`', @table_name, '` ',
    'ADD COLUMN `notes` VARCHAR(200) NULL COMMENT ''用户填写的植物备注，最多 200 字'' AFTER `plant_date`'
  ),
  CONCAT('SELECT ''', @dev_schema, '.user_plant_instances.notes already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;
