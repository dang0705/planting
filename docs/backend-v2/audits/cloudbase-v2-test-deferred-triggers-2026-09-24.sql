-- 仅用于 qinghuazhi_v2_test：tcb db execute 不支持 CREATE TRIGGER（1295）的 11 个触发器，经 TDSQL-C 控制台 SQL 窗口执行。
DELIMITER $$

-- 004_care_diagnosis.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_environment_observations_reject_update`
BEFORE UPDATE ON `qinghuazhi_v2_test`.`care_environment_observations`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '原子环境事实不可修改，请追加新事实';
END$$

-- 004_care_diagnosis.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_environment_snapshots_reject_update`
BEFORE UPDATE ON `qinghuazhi_v2_test`.`care_environment_snapshots`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '养护环境输入快照不可修改，请创建新快照';
END$$

-- 004_care_diagnosis.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_environment_derivations_reject_update`
BEFORE UPDATE ON `qinghuazhi_v2_test`.`care_environment_derivations`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '派生环境指标不可修改，请使用新算法 release 追加结果';
END$$

-- 004_care_diagnosis.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_temporary_care_results_reject_update`
BEFORE UPDATE ON `qinghuazhi_v2_test`.`temporary_care_results`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '已生成的游客临时养护结果不可修改';
END$$

-- 012_plant_encyclopedia_revision_immutability.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_plant_encyclopedia_revision_content_immutable`
BEFORE UPDATE ON `qinghuazhi_v2_test`.`plant_encyclopedia_revisions`
FOR EACH ROW
BEGIN
  IF NOT (OLD.`id` <=> NEW.`id`)
    OR NOT (OLD.`_openid` <=> NEW.`_openid`)
    OR NOT (OLD.`revision_ref` <=> NEW.`revision_ref`)
    OR NOT (OLD.`plant_identity_internal_id` <=> NEW.`plant_identity_internal_id`)
    OR NOT (OLD.`structure_version` <=> NEW.`structure_version`)
    OR NOT (OLD.`display_content_json` <=> NEW.`display_content_json`)
    OR NOT (OLD.`source_kind` <=> NEW.`source_kind`)
    OR NOT (OLD.`content_hash` <=> NEW.`content_hash`)
    OR NOT (OLD.`contributor_user_internal_id` <=> NEW.`contributor_user_internal_id`)
    OR NOT (OLD.`created_at_ms` <=> NEW.`created_at_ms`)
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Encyclopedia revision content is immutable; create a new revision';
  END IF;
END$$

-- 013_plant_encyclopedia_review_binding.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_cms_review_exact_revision_insert`
BEFORE INSERT ON `qinghuazhi_v2_test`.`cms_review_items`
FOR EACH ROW
BEGIN
  DECLARE bound_revision_ref VARCHAR(64) DEFAULT NULL;
  IF NEW.`subject_type` = 'encyclopedia' THEN
    IF NEW.`draft_revision_internal_id` IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encyclopedia review requires a revision';
    END IF;
    SELECT `revision_ref` INTO bound_revision_ref
      FROM `qinghuazhi_v2_test`.`plant_encyclopedia_revisions`
      WHERE `id` = NEW.`draft_revision_internal_id`;
    IF bound_revision_ref IS NULL OR BINARY bound_revision_ref <> BINARY NEW.`subject_ref` THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encyclopedia review revision mismatch';
    END IF;
  END IF;
END$$

-- 013_plant_encyclopedia_review_binding.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_cms_review_exact_revision_update`
BEFORE UPDATE ON `qinghuazhi_v2_test`.`cms_review_items`
FOR EACH ROW
BEGIN
  DECLARE bound_revision_ref VARCHAR(64) DEFAULT NULL;
  IF OLD.`subject_type` = 'encyclopedia' AND (
    NOT (OLD.`subject_type` <=> NEW.`subject_type`)
    OR NOT (OLD.`draft_revision_internal_id` <=> NEW.`draft_revision_internal_id`)
    OR BINARY OLD.`subject_ref` <> BINARY NEW.`subject_ref`
    OR BINARY OLD.`review_item_ref` <> BINARY NEW.`review_item_ref`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encyclopedia review binding is immutable';
  END IF;
  IF NEW.`subject_type` = 'encyclopedia' THEN
    IF NEW.`draft_revision_internal_id` IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encyclopedia review requires a revision';
    END IF;
    SELECT `revision_ref` INTO bound_revision_ref
      FROM `qinghuazhi_v2_test`.`plant_encyclopedia_revisions`
      WHERE `id` = NEW.`draft_revision_internal_id`;
    IF bound_revision_ref IS NULL OR BINARY bound_revision_ref <> BINARY NEW.`subject_ref` THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encyclopedia review revision mismatch';
    END IF;
  END IF;
END$$

-- 014_plant_knowledge_release_immutability.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_plant_knowledge_release_no_update`
BEFORE UPDATE ON `qinghuazhi_v2_test`.`plant_knowledge_releases`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Plant knowledge release is immutable; create a new release';
END$$

-- 014_plant_knowledge_release_immutability.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_plant_knowledge_release_no_delete`
BEFORE DELETE ON `qinghuazhi_v2_test`.`plant_knowledge_releases`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Plant knowledge release cannot be deleted';
END$$

-- 014_plant_knowledge_release_immutability.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_plant_knowledge_release_item_no_update`
BEFORE UPDATE ON `qinghuazhi_v2_test`.`plant_knowledge_release_items`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Plant knowledge release item is immutable; create a new release';
END$$

-- 014_plant_knowledge_release_immutability.sql
CREATE TRIGGER `qinghuazhi_v2_test`.`trg_plant_knowledge_release_item_no_delete`
BEFORE DELETE ON `qinghuazhi_v2_test`.`plant_knowledge_release_items`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Plant knowledge release item cannot be deleted';
END$$

DELIMITER ;
