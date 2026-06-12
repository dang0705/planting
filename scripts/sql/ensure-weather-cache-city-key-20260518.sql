-- Extend weather_cache for city-level 24h weather cache.
-- Keep existing _openid rows for diagnose-http weather context compatibility.

SET @prod_schema = 'cloud1-2grufevs395a9d5e';
SET @dev_schema = 'cloud1_dev';
SET @table_name = 'weather_cache';

SET @column_name = 'cache_scope';
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
    'ADD COLUMN `cache_scope` VARCHAR(32) NOT NULL DEFAULT ''user'' COMMENT ''user|city cache scope'' AFTER `_openid`'
  ),
  CONCAT('SELECT ''', @prod_schema, '.weather_cache.cache_scope already exists'' AS migration_status')
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
    'ADD COLUMN `cache_scope` VARCHAR(32) NOT NULL DEFAULT ''user'' COMMENT ''user|city cache scope'' AFTER `_openid`'
  ),
  CONCAT('SELECT ''', @dev_schema, '.weather_cache.cache_scope already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;

SET @column_name = 'cache_key';
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
    'ADD COLUMN `cache_key` VARCHAR(191) NULL COMMENT ''normalized city cache key'' AFTER `cache_scope`'
  ),
  CONCAT('SELECT ''', @prod_schema, '.weather_cache.cache_key already exists'' AS migration_status')
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
    'ADD COLUMN `cache_key` VARCHAR(191) NULL COMMENT ''normalized city cache key'' AFTER `cache_scope`'
  ),
  CONCAT('SELECT ''', @dev_schema, '.weather_cache.cache_key already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;

SET @column_name = 'city';
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
    'ADD COLUMN `city` VARCHAR(128) NULL COMMENT ''city name from Tencent geocoder'' AFTER `cache_key`'
  ),
  CONCAT('SELECT ''', @prod_schema, '.weather_cache.city already exists'' AS migration_status')
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
    'ADD COLUMN `city` VARCHAR(128) NULL COMMENT ''city name from Tencent geocoder'' AFTER `cache_key`'
  ),
  CONCAT('SELECT ''', @dev_schema, '.weather_cache.city already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;

SET @column_name = 'province';
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
    'ADD COLUMN `province` VARCHAR(128) NULL COMMENT ''province name from Tencent geocoder'' AFTER `city`'
  ),
  CONCAT('SELECT ''', @prod_schema, '.weather_cache.province already exists'' AS migration_status')
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
    'ADD COLUMN `province` VARCHAR(128) NULL COMMENT ''province name from Tencent geocoder'' AFTER `city`'
  ),
  CONCAT('SELECT ''', @dev_schema, '.weather_cache.province already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;

SET @index_name = 'uniq_weather_cache_scope_key';
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
    'ADD UNIQUE INDEX `', @index_name, '` (`cache_scope`, `cache_key`)'
  ),
  CONCAT('SELECT ''', @prod_schema, '.weather_cache.uniq_weather_cache_scope_key already exists'' AS migration_status')
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
    'ADD UNIQUE INDEX `', @index_name, '` (`cache_scope`, `cache_key`)'
  ),
  CONCAT('SELECT ''', @dev_schema, '.weather_cache.uniq_weather_cache_scope_key already exists'' AS migration_status')
);
PREPARE dev_stmt FROM @dev_sql;
EXECUTE dev_stmt;
DEALLOCATE PREPARE dev_stmt;
