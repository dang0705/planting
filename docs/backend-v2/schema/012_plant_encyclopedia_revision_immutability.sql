-- 青花植后端 v2 / 展示百科修订内容不可原地改写。
-- 保留审核状态与更新时间的合法推进；修改正文必须创建新修订重新审核。

DELIMITER $$

CREATE TRIGGER `trg_plant_encyclopedia_revision_content_immutable`
BEFORE UPDATE ON `plant_encyclopedia_revisions`
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

DELIMITER ;
