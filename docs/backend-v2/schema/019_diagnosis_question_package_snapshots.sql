-- 诊断会话锁定本次题包内容；旧行不补造，新行必须提供内容和摘要。
-- 顺序：004和017之后；仅在独立迁移阶段执行，不得在HTTP启动时执行。
ALTER TABLE `diagnosis_sessions`
  ADD COLUMN `question_package_snapshot_json` JSON NULL COMMENT '本次实际题目与选项的不可变完整快照；历史缺失为空',
  ADD COLUMN `question_package_snapshot_sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '完整快照规范化SHA-256，读取时重算',
  ADD CONSTRAINT `ck_diagnosis_package_snapshot_pair` CHECK (
    (`question_package_snapshot_json` IS NULL AND `question_package_snapshot_sha256` IS NULL)
    OR (`question_package_snapshot_json` IS NOT NULL AND `question_package_snapshot_sha256` IS NOT NULL
      AND JSON_TYPE(`question_package_snapshot_json`) = 'OBJECT'
      AND `question_package_snapshot_sha256` REGEXP '^[0-9a-f]{64}$'
      AND COALESCE(BINARY JSON_UNQUOTE(JSON_EXTRACT(`question_package_snapshot_json`, '$.questionPackageReleaseRef')) = BINARY `question_package_release_ref`, FALSE)
      AND COALESCE(BINARY JSON_UNQUOTE(JSON_EXTRACT(`question_package_snapshot_json`, '$.mode')) = BINARY `symptom_type`, FALSE))
  );

ALTER TABLE `temporary_diagnosis_sessions`
  ADD COLUMN `question_package_snapshot_json` JSON NULL COMMENT '本次实际题目与选项的不可变完整快照；历史缺失为空',
  ADD COLUMN `question_package_snapshot_sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '完整快照规范化SHA-256，读取时重算',
  ADD CONSTRAINT `ck_temporary_diagnosis_package_snapshot_pair` CHECK (
    (`question_package_snapshot_json` IS NULL AND `question_package_snapshot_sha256` IS NULL)
    OR (`question_package_snapshot_json` IS NOT NULL AND `question_package_snapshot_sha256` IS NOT NULL
      AND JSON_TYPE(`question_package_snapshot_json`) = 'OBJECT'
      AND `question_package_snapshot_sha256` REGEXP '^[0-9a-f]{64}$'
      AND COALESCE(BINARY JSON_UNQUOTE(JSON_EXTRACT(`question_package_snapshot_json`, '$.questionPackageReleaseRef')) = BINARY `question_package_release_ref`, FALSE)
      AND COALESCE(BINARY JSON_UNQUOTE(JSON_EXTRACT(`question_package_snapshot_json`, '$.mode')) = BINARY `symptom_type`, FALSE))
  );

DELIMITER $$
CREATE TRIGGER `tr_diagnosis_package_snapshot_insert` BEFORE INSERT ON `diagnosis_sessions`
FOR EACH ROW
BEGIN
  IF NEW.`question_package_snapshot_json` IS NULL OR NEW.`question_package_snapshot_sha256` IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'new diagnosis session requires locked question snapshot';
  END IF;
END$$
CREATE TRIGGER `tr_diagnosis_package_snapshot_update` BEFORE UPDATE ON `diagnosis_sessions`
FOR EACH ROW
BEGIN
  IF NOT (NEW.`question_package_snapshot_json` <=> OLD.`question_package_snapshot_json`)
    OR NOT (NEW.`question_package_snapshot_sha256` <=> OLD.`question_package_snapshot_sha256`)
    OR BINARY NEW.`question_package_release_ref` <> BINARY OLD.`question_package_release_ref`
    OR BINARY NEW.`symptom_type` <> BINARY OLD.`symptom_type`
    OR NEW.`user_internal_id` <> OLD.`user_internal_id`
    OR NEW.`user_plant_internal_id` <> OLD.`user_plant_internal_id` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'diagnosis question snapshot is immutable';
  END IF;
END$$
CREATE TRIGGER `tr_temporary_diagnosis_package_snapshot_insert` BEFORE INSERT ON `temporary_diagnosis_sessions`
FOR EACH ROW
BEGIN
  IF NEW.`question_package_snapshot_json` IS NULL OR NEW.`question_package_snapshot_sha256` IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'new temporary diagnosis requires locked question snapshot';
  END IF;
END$$
CREATE TRIGGER `tr_temporary_diagnosis_package_snapshot_update` BEFORE UPDATE ON `temporary_diagnosis_sessions`
FOR EACH ROW
BEGIN
  IF NOT (NEW.`question_package_snapshot_json` <=> OLD.`question_package_snapshot_json`)
    OR NOT (NEW.`question_package_snapshot_sha256` <=> OLD.`question_package_snapshot_sha256`)
    OR BINARY NEW.`question_package_release_ref` <> BINARY OLD.`question_package_release_ref`
    OR BINARY NEW.`symptom_type` <> BINARY OLD.`symptom_type`
    OR NOT (NEW.`guest_plant_case_internal_id` <=> OLD.`guest_plant_case_internal_id`)
    OR NOT (NEW.`authenticated_ephemeral_case_internal_id` <=> OLD.`authenticated_ephemeral_case_internal_id`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'temporary diagnosis question snapshot is immutable';
  END IF;
END$$
DELIMITER ;
