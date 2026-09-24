-- 青花植后端 v2 / 展示百科审核项必须绑定确切的修订。
-- 内部键和公开引用必须指向同一条不可变修订；其他审核主题保持独立。

DELIMITER $$

CREATE TRIGGER `trg_cms_review_exact_revision_insert`
BEFORE INSERT ON `cms_review_items`
FOR EACH ROW
BEGIN
  DECLARE bound_revision_ref VARCHAR(64) DEFAULT NULL;
  IF NEW.`subject_type` = 'encyclopedia' THEN
    IF NEW.`draft_revision_internal_id` IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encyclopedia review requires a revision';
    END IF;
    SELECT `revision_ref` INTO bound_revision_ref
      FROM `plant_encyclopedia_revisions`
      WHERE `id` = NEW.`draft_revision_internal_id`;
    IF bound_revision_ref IS NULL OR BINARY bound_revision_ref <> BINARY NEW.`subject_ref` THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encyclopedia review revision mismatch';
    END IF;
  END IF;
END$$

CREATE TRIGGER `trg_cms_review_exact_revision_update`
BEFORE UPDATE ON `cms_review_items`
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
      FROM `plant_encyclopedia_revisions`
      WHERE `id` = NEW.`draft_revision_internal_id`;
    IF bound_revision_ref IS NULL OR BINARY bound_revision_ref <> BINARY NEW.`subject_ref` THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encyclopedia review revision mismatch';
    END IF;
  END IF;
END$$

DELIMITER ;
