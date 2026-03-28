-- DB_MIGRATION_V2_SCHEMA_ALIGNMENT.sql
-- Purpose:
-- 1) Align DB schema to DATABASE_SCHEMA_SPEC_v2 + plants_v13_user_friendly_full_v7.xlsx
-- 2) Keep internal id PK rule for core dictionary tables
-- 3) Remove legacy columns not in Excel truth source
--
-- Target schemas:
-- - cloud1_dev
-- - cloud1-2grufevs395a9d5e
--
-- Safe to rerun: YES (idempotent helpers)

DELIMITER $$

DROP PROCEDURE IF EXISTS ensure_unique_index $$
CREATE PROCEDURE ensure_unique_index(
  IN p_schema VARCHAR(128),
  IN p_table VARCHAR(128),
  IN p_index_name VARCHAR(128),
  IN p_index_cols TEXT
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_sql TEXT;

  SELECT COUNT(*)
    INTO v_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = p_schema
     AND TABLE_NAME = p_table
     AND INDEX_NAME = p_index_name
     AND NON_UNIQUE = 0;

  IF v_exists = 0 THEN
    SET v_sql = CONCAT(
      'ALTER TABLE `', p_schema, '`.`', p_table, '` ',
      'ADD UNIQUE KEY `', p_index_name, '` (', p_index_cols, ')'
    );
    PREPARE stmt FROM v_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS ensure_id_primary $$
CREATE PROCEDURE ensure_id_primary(
  IN p_schema VARCHAR(128),
  IN p_table VARCHAR(128)
)
BEGIN
  DECLARE v_has_id INT DEFAULT 0;
  DECLARE v_pk_is_id INT DEFAULT 0;
  DECLARE v_sql TEXT;

  SELECT COUNT(*)
    INTO v_has_id
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = p_schema
     AND TABLE_NAME = p_table
     AND COLUMN_NAME = 'id';

  SELECT COUNT(*)
    INTO v_pk_is_id
    FROM information_schema.TABLE_CONSTRAINTS tc
    JOIN information_schema.KEY_COLUMN_USAGE kcu
      ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
     AND tc.TABLE_NAME = kcu.TABLE_NAME
   WHERE tc.TABLE_SCHEMA = p_schema
     AND tc.TABLE_NAME = p_table
     AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
     AND kcu.COLUMN_NAME = 'id';

  IF v_has_id = 0 THEN
    SET v_sql = CONCAT(
      'ALTER TABLE `', p_schema, '`.`', p_table, '` ',
      'ADD COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT FIRST, ',
      'DROP PRIMARY KEY, ',
      'ADD PRIMARY KEY (`id`)'
    );
    PREPARE stmt FROM v_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  ELSEIF v_pk_is_id = 0 THEN
    SET v_sql = CONCAT(
      'ALTER TABLE `', p_schema, '`.`', p_table, '` ',
      'DROP PRIMARY KEY, ',
      'ADD PRIMARY KEY (`id`)'
    );
    PREPARE stmt FROM v_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS drop_column_if_exists $$
CREATE PROCEDURE drop_column_if_exists(
  IN p_schema VARCHAR(128),
  IN p_table VARCHAR(128),
  IN p_column VARCHAR(128)
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_sql TEXT;

  SELECT COUNT(*)
    INTO v_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = p_schema
     AND TABLE_NAME = p_table
     AND COLUMN_NAME = p_column;

  IF v_exists > 0 THEN
    SET v_sql = CONCAT(
      'ALTER TABLE `', p_schema, '`.`', p_table, '` ',
      'DROP COLUMN `', p_column, '`'
    );
    PREPARE stmt FROM v_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS add_column_if_missing $$
CREATE PROCEDURE add_column_if_missing(
  IN p_schema VARCHAR(128),
  IN p_table VARCHAR(128),
  IN p_column VARCHAR(128),
  IN p_column_def TEXT
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_sql TEXT;

  SELECT COUNT(*)
    INTO v_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = p_schema
     AND TABLE_NAME = p_table
     AND COLUMN_NAME = p_column;

  IF v_exists = 0 THEN
    SET v_sql = CONCAT(
      'ALTER TABLE `', p_schema, '`.`', p_table, '` ',
      'ADD COLUMN `', p_column, '` ', p_column_def
    );
    PREPARE stmt FROM v_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS add_index_if_missing $$
CREATE PROCEDURE add_index_if_missing(
  IN p_schema VARCHAR(128),
  IN p_table VARCHAR(128),
  IN p_index_name VARCHAR(128),
  IN p_index_cols TEXT
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_sql TEXT;

  SELECT COUNT(*)
    INTO v_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = p_schema
     AND TABLE_NAME = p_table
     AND INDEX_NAME = p_index_name;

  IF v_exists = 0 THEN
    SET v_sql = CONCAT(
      'ALTER TABLE `', p_schema, '`.`', p_table, '` ',
      'ADD INDEX `', p_index_name, '` (', p_index_cols, ')'
    );
    PREPARE stmt FROM v_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS run_schema_alignment $$
CREATE PROCEDURE run_schema_alignment(IN p_schema VARCHAR(128))
BEGIN
  -- 1) id PK rule + business unique key
  CALL ensure_unique_index(p_schema, 'problems', 'uk_problems_problem_key', '`problem_key`');
  CALL ensure_id_primary(p_schema, 'problems');

  CALL ensure_unique_index(p_schema, 'symptoms', 'uk_symptoms_symptom_key', '`symptom_key`');
  CALL ensure_id_primary(p_schema, 'symptoms');

  -- 2) drop legacy columns not in Excel truth source
  CALL drop_column_if_exists(p_schema, 'problems', 'note');
  CALL drop_column_if_exists(p_schema, 'problems', '_openid');

  CALL drop_column_if_exists(p_schema, 'symptoms', 'base_evidence_weight');
  CALL drop_column_if_exists(p_schema, 'symptoms', 'symptom_reliability');
  CALL drop_column_if_exists(p_schema, 'symptoms', '_openid');

  CALL drop_column_if_exists(p_schema, 'symptom_problem_evidence', 'evidence_reliability');
  CALL drop_column_if_exists(p_schema, 'symptom_problem_evidence', '_openid');

  CALL drop_column_if_exists(p_schema, 'problem_host_profiles', 'weight_basis');
  CALL drop_column_if_exists(p_schema, 'problem_host_profiles', '_openid');

  CALL drop_column_if_exists(p_schema, 'plant_problem_profiles', 'host_level');
  CALL drop_column_if_exists(p_schema, 'plant_problem_profiles', 'is_genus_candidate');
  CALL drop_column_if_exists(p_schema, 'plant_problem_profiles', '_openid');

  CALL drop_column_if_exists(p_schema, 'problem_causality', '_openid');

  -- 3) enable soft delete support for problem_causality removed diffs
  CALL add_column_if_missing(
    p_schema,
    'problem_causality',
    'is_active',
    'TINYINT(1) NOT NULL DEFAULT 1'
  );
  SET @sql_fill_active = CONCAT(
    'UPDATE `', p_schema, '`.`problem_causality` ',
    'SET `is_active` = 1 WHERE `is_active` IS NULL'
  );
  PREPARE stmt FROM @sql_fill_active;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
  CALL add_index_if_missing(
    p_schema,
    'problem_causality',
    'idx_problem_causality_active',
    '`is_active`'
  );
END $$

DELIMITER ;

-- Execute for both schemas
CALL run_schema_alignment('cloud1_dev');
CALL run_schema_alignment('cloud1-2grufevs395a9d5e');

-- Post-check: PK + unique for problems/symptoms
SELECT
  k.TABLE_SCHEMA,
  k.TABLE_NAME,
  GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION) AS primary_key_columns
FROM information_schema.KEY_COLUMN_USAGE k
WHERE k.CONSTRAINT_NAME = 'PRIMARY'
  AND k.TABLE_SCHEMA IN ('cloud1_dev', 'cloud1-2grufevs395a9d5e')
  AND k.TABLE_NAME IN ('problems', 'symptoms')
GROUP BY k.TABLE_SCHEMA, k.TABLE_NAME
ORDER BY k.TABLE_SCHEMA, k.TABLE_NAME;

SELECT
  s.TABLE_SCHEMA,
  s.TABLE_NAME,
  s.INDEX_NAME,
  GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX) AS unique_columns
FROM information_schema.STATISTICS s
WHERE s.NON_UNIQUE = 0
  AND s.TABLE_SCHEMA IN ('cloud1_dev', 'cloud1-2grufevs395a9d5e')
  AND s.TABLE_NAME IN ('problems', 'symptoms')
GROUP BY s.TABLE_SCHEMA, s.TABLE_NAME, s.INDEX_NAME
ORDER BY s.TABLE_SCHEMA, s.TABLE_NAME, s.INDEX_NAME;

-- Cleanup helper procedures
DROP PROCEDURE IF EXISTS run_schema_alignment;
DROP PROCEDURE IF EXISTS add_index_if_missing;
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS drop_column_if_exists;
DROP PROCEDURE IF EXISTS ensure_id_primary;
DROP PROCEDURE IF EXISTS ensure_unique_index;
