-- 三端手机号会话迁移（仅定义；执行前必须先完成备份和 dry-run）。
-- 禁止在此文件写入手机号、密钥或任何凭据。生产与开发库必须分别由受控发布流程执行。
-- 回滚策略：本迁移只新增列、索引、表和可重放回填；原平台标识保留在 users.principal_openid / wechat_openid 与身份表中。
-- 归属策略：历史业务表继续使用 users._openid 作为存储归属键；持久会话解析时
-- 将 users._id（业务用户 ID）映射回该键，避免批量改写历史行造成跨账户覆盖。

DROP PROCEDURE IF EXISTS ensure_multiplatform_phone_session_schema;
DELIMITER $$
CREATE PROCEDURE ensure_multiplatform_phone_session_schema(IN target_schema VARCHAR(128))
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE table_name_value VARCHAR(128);
  DECLARE owner_tables CURSOR FOR
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = target_schema
       AND table_name IN (
         'user_plant_instances', 'plant_images', 'plant_care_locations', 'diagnosis_sessions',
         'diagnosis_result_snapshots', 'diagnosis_symptom_observations', 'diagnosis_follow_ups',
         'identify_sessions', 'user_watering_events', 'user_watering_reminder_events',
         'user_fertilization_events', 'user_fertilization_reminder_events', 'subscription_orders',
         'user_diagnose_quota', 'user_identify_quota', 'watering_advisor_sessions',
         'user_plant_file_deletion_jobs', 'diagnosis_feedback', 'diagnosis_follow_up_answer_events',
         'question_package_state', 'question_queue', 'observed_evidence_set', 'stop_state',
         'plant_identity_resolution_records',
         'visual_call_batches', 'visual_raw_image_records', 'visual_normalized_image_results',
         'visual_admission_records', 'visual_call_aggregate_results', 'visual_supervision_records'
       );
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  SET @schema_quoted = REPLACE(target_schema, '`', '``');

  SET @column_exists = (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = 'users' AND column_name = 'phone_hash');
  SET @sql = IF(@column_exists = 0,
    CONCAT('ALTER TABLE `', @schema_quoted, '`.`users` ADD COLUMN `phone_hash` CHAR(64) NULL COMMENT ''手机号 HMAC，不保存客户端可读明文'''),
    'SELECT ''users.phone_hash already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  SET @column_exists = (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = 'users' AND column_name = 'phone_ciphertext');
  SET @sql = IF(@column_exists = 0,
    CONCAT('ALTER TABLE `', @schema_quoted, '`.`users` ADD COLUMN `phone_ciphertext` TEXT NULL COMMENT ''仅服务端可解密的手机号密文'''),
    'SELECT ''users.phone_ciphertext already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  SET @column_exists = (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = 'users' AND column_name = 'phone_masked');
  SET @sql = IF(@column_exists = 0,
    CONCAT('ALTER TABLE `', @schema_quoted, '`.`users` ADD COLUMN `phone_masked` VARCHAR(40) NULL COMMENT ''可回传客户端的脱敏手机号'''),
    'SELECT ''users.phone_masked already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  SET @index_exists = (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = target_schema AND table_name = 'users' AND index_name = 'uk_users_phone_hash');
  SET @sql = IF(@index_exists = 0,
    CONCAT('CREATE UNIQUE INDEX `uk_users_phone_hash` ON `', @schema_quoted, '`.`users` (`phone_hash`)'),
    'SELECT ''users.uk_users_phone_hash already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  SET @sql = CONCAT(
    'CREATE TABLE IF NOT EXISTS `', @schema_quoted, '`.`user_sessions` (',
    'session_id VARCHAR(80) NOT NULL, token_hash CHAR(64) NOT NULL, phone_proof_hash CHAR(64) NOT NULL, user_id VARCHAR(128) NOT NULL, ',
    'platform VARCHAR(32) NOT NULL, app_id VARCHAR(128) NOT NULL, expires_at BIGINT NOT NULL, revoked_at BIGINT NULL, ',
    'created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (session_id), ',
    'UNIQUE KEY uk_user_sessions_token_hash (token_hash), UNIQUE KEY uk_user_sessions_phone_proof_hash (phone_proof_hash), ',
    'KEY idx_user_sessions_user_expiry (user_id, expires_at)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''三端随机 Bearer 会话，只保存 token 哈希'''
  );
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  SET @proof_hash_column_exists = (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = 'user_sessions' AND column_name = 'phone_proof_hash');
  SET @sql = IF(@proof_hash_column_exists = 0,
    CONCAT('ALTER TABLE `', @schema_quoted, '`.`user_sessions` ADD COLUMN `phone_proof_hash` CHAR(64) NULL'),
    'SELECT ''user_sessions.phone_proof_hash already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  SET @proof_hash_index_exists = (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = target_schema AND table_name = 'user_sessions' AND index_name = 'uk_user_sessions_phone_proof_hash');
  SET @sql = IF(@proof_hash_index_exists = 0,
    CONCAT('CREATE UNIQUE INDEX `uk_user_sessions_phone_proof_hash` ON `', @schema_quoted, '`.`user_sessions` (`phone_proof_hash`)'),
    'SELECT ''user_sessions.uk_user_sessions_phone_proof_hash already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  SET @identity_column_exists = (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = 'user_platform_identities' AND column_name = 'platform_user_id');
  SET @sql = IF(@identity_column_exists = 0,
    CONCAT('ALTER TABLE `', @schema_quoted, '`.`user_platform_identities` ADD COLUMN `platform_user_id` VARCHAR(160) NULL'),
    'SELECT ''user_platform_identities.platform_user_id already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  SET @sql = CONCAT('UPDATE `', @schema_quoted, '`.`user_platform_identities` SET platform_user_id = COALESCE(NULLIF(platform_user_id, ''''), NULLIF(openid, '''')) WHERE platform_user_id IS NULL OR platform_user_id = ''''');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  SET @identity_hash_exists = (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = 'user_platform_identities' AND column_name = 'phone_hash');
  SET @sql = IF(@identity_hash_exists = 0,
    CONCAT('ALTER TABLE `', @schema_quoted, '`.`user_platform_identities` ADD COLUMN `phone_hash` CHAR(64) NULL'),
    'SELECT ''user_platform_identities.phone_hash already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  SET @identity_index_exists = (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = target_schema AND table_name = 'user_platform_identities' AND index_name = 'uk_platform_app_user');
  SET @sql = IF(@identity_index_exists = 0,
    CONCAT('CREATE UNIQUE INDEX `uk_platform_app_user` ON `', @schema_quoted, '`.`user_platform_identities` (`platform`, `app_id`, `platform_user_id`)'),
    'SELECT ''user_platform_identities.uk_platform_app_user already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  OPEN owner_tables;
  owner_loop: LOOP
    FETCH owner_tables INTO table_name_value;
    IF done THEN LEAVE owner_loop; END IF;
    SET @has_openid = (SELECT COUNT(1) FROM information_schema.columns
      WHERE table_schema = target_schema AND table_name = table_name_value AND column_name = '_openid');
    IF @has_openid > 0 THEN
      SET @has_owner = (SELECT COUNT(1) FROM information_schema.columns
        WHERE table_schema = target_schema AND table_name = table_name_value AND column_name = 'owner_user_id');
      SET @sql = IF(@has_owner = 0,
        CONCAT('ALTER TABLE `', @schema_quoted, '`.`', table_name_value, '` ADD COLUMN `owner_user_id` VARCHAR(128) NULL'),
        'SELECT ''owner_user_id already exists'' AS migration_status');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
      SET @sql = CONCAT(
        'UPDATE `', @schema_quoted, '`.`', table_name_value, '` child ',
        'JOIN `', @schema_quoted, '`.`users` u ON BINARY child._openid = BINARY u._openid ',
        'OR BINARY child._openid = BINARY u.principal_openid ',
        'OR BINARY child._openid = BINARY u.wechat_openid ',
        'SET child.owner_user_id = u._id WHERE child.owner_user_id IS NULL OR child.owner_user_id = '''''
      );
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
      SET @index_name = CONCAT('idx_owner_user_', LEFT(MD5(table_name_value), 10));
      SET @has_owner_index = (SELECT COUNT(1) FROM information_schema.statistics
        WHERE table_schema = target_schema AND table_name = table_name_value AND index_name = @index_name);
      SET @sql = IF(@has_owner_index = 0,
        CONCAT('CREATE INDEX `', @index_name, '` ON `', @schema_quoted, '`.`', table_name_value, '` (`owner_user_id`)'),
        'SELECT ''owner_user_id index already exists'' AS migration_status');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
  END LOOP;
  CLOSE owner_tables;

  -- 支付订单在 owner 切换后仍需保留微信支付方 OpenID，供统一下单和回调验签使用。
  -- 该字段只在服务端读取，绝不作为客户端会话身份。
  SET @subscription_exists = (SELECT COUNT(1) FROM information_schema.tables
    WHERE table_schema = target_schema AND table_name = 'subscription_orders');
  IF @subscription_exists > 0 THEN
    SET @payer_column_exists = (SELECT COUNT(1) FROM information_schema.columns
      WHERE table_schema = target_schema AND table_name = 'subscription_orders' AND column_name = 'payer_openid');
    SET @sql = IF(@payer_column_exists = 0,
      CONCAT('ALTER TABLE `', @schema_quoted, '`.`subscription_orders` ADD COLUMN `payer_openid` VARCHAR(128) NULL'),
      'SELECT ''subscription_orders.payer_openid already exists'' AS migration_status');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    SET @sql = CONCAT(
      'UPDATE `', @schema_quoted, '`.`subscription_orders` o ',
      'JOIN `', @schema_quoted, '`.`users` u ON BINARY u._id = BINARY COALESCE(NULLIF(o.owner_user_id, ''''), NULLIF(o.user_id, ''''), o._openid) ',
      'SET o.payer_openid = COALESCE(NULLIF(o.payer_openid, ''''), NULLIF(u.wechat_openid, ''''), NULLIF(u.principal_openid, '''')) ',
      'WHERE o.payer_openid IS NULL OR o.payer_openid = '''''
    );
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;

  SET @plant_record_version_exists = (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = 'user_plant_instances' AND column_name = 'record_version');
  SET @sql = IF(@plant_record_version_exists = 0,
    CONCAT('ALTER TABLE `', @schema_quoted, '`.`user_plant_instances` ADD COLUMN `record_version` INT UNSIGNED NOT NULL DEFAULT 1'),
    'SELECT ''user_plant_instances.record_version already exists'' AS migration_status');
  PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
END$$
DELIMITER ;

-- 执行顺序：先在开发库 dry-run 核对统计，再由受控发布流程执行下列 CALL。
-- CALL ensure_multiplatform_phone_session_schema('cloud1_dev');
-- CALL ensure_multiplatform_phone_session_schema('cloud1-2grufevs395a9d5e');

-- 回填验收：任意非零结果必须先处理，不能启用 owner_user_id 读路径。
-- SELECT 'user_plant_instances' AS table_name, COUNT(*) AS missing_owner
--   FROM `cloud1_dev`.user_plant_instances WHERE owner_user_id IS NULL OR owner_user_id = '';
-- SELECT platform, app_id, platform_user_id, COUNT(*) AS duplicate_count
--   FROM `cloud1_dev`.user_platform_identities
--  GROUP BY platform, app_id, platform_user_id HAVING duplicate_count > 1;
