-- 诊断结果回放记录：旧行保持空值，不从当前发布补写历史事实。
-- 前置004与009；无旧字段重命名/丢弃，记录数应保持一致。
-- 切换：应用先确认新列和触发器存在，再使用新Repository；启动阶段不执行DDL。
-- 回退：停止新结果写入并回退应用；保留新列及已写快照，不删除历史记录。
ALTER TABLE `diagnosis_results`
  ADD COLUMN `record_schema_version` VARCHAR(48) NULL COMMENT '完整结果记录结构版本，旧行为空',
  ADD COLUMN `public_result_json` JSON NULL COMMENT '严格脱敏公开结果完整正文',
  ADD COLUMN `replay_snapshot_json` JSON NULL COMMENT '输入证据、版本和决策轨迹的内部完整回放',
  ADD COLUMN `record_sha256` CHAR(64) NULL COMMENT '完整公开结果与回放记录的规范化摘要',
  ADD COLUMN `knowledge_release_ref` VARCHAR(96) NULL COMMENT '该次锁定的诊断知识发布引用',
  ADD CONSTRAINT `fk_diag_result_knowledge_release` FOREIGN KEY (`knowledge_release_ref`) REFERENCES `diagnosis_knowledge_releases` (`release_ref`),
  ADD CONSTRAINT `ck_diag_result_record_complete` CHECK (
    (`record_schema_version` IS NULL AND `public_result_json` IS NULL AND `replay_snapshot_json` IS NULL AND `record_sha256` IS NULL AND `knowledge_release_ref` IS NULL)
    OR (`record_schema_version`='diagnosis-result-record/v1' AND `public_result_json` IS NOT NULL AND `replay_snapshot_json` IS NOT NULL AND `record_sha256` IS NOT NULL AND `knowledge_release_ref` IS NOT NULL)
  );
DELIMITER $$
CREATE TRIGGER `tr_diag_result_record_insert` BEFORE INSERT ON `diagnosis_results` FOR EACH ROW
BEGIN
  IF NEW.record_schema_version IS NULL OR NEW._openid<>'' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='新诊断结果必须提供完整回放记录';
  END IF;
END$$
CREATE TRIGGER `tr_diag_result_record_update` BEFORE UPDATE ON `diagnosis_results` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='诊断结果不可修改';
END$$
CREATE TRIGGER `tr_diag_result_record_delete` BEFORE DELETE ON `diagnosis_results` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='诊断结果不可删除';
END$$
DELIMITER ;
