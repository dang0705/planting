-- Air Environment v2: one optional JSON profile per user plant.
-- TDSQL/MySQL in this project does not support ADD COLUMN IF NOT EXISTS.
-- This migration is idempotent through information_schema + dynamic SQL.
-- It only adds a nullable column; it does not rewrite existing plant data.

SET @prod_schema = 'cloud1-2grufevs395a9d5e';
SET @dev_schema = 'cloud1_dev';
SET @table_name = 'user_plant_instances';
SET @column_name = 'air_environment_json';

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
    'ADD COLUMN `air_environment_json` JSON NULL COMMENT ''Air environment profile v1: input, care-location binding and optimistic updatedAt'''
  ),
  CONCAT('SELECT ''', @prod_schema, '.user_plant_instances.air_environment_json already exists'' AS migration_status')
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
    'ADD COLUMN `air_environment_json` JSON NULL COMMENT ''Air environment profile v1: input, care-location binding and optimistic updatedAt'''
  ),
  CONCAT('SELECT ''', @dev_schema, '.user_plant_instances.air_environment_json already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;
