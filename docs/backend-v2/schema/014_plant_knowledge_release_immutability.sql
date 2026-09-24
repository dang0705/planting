-- 青花植后端 v2 / 植物知识发布制品及明细只追加。
-- 发布后修改内容必须创建新 release；活动指针仍可在独立事务中受控切换。

DELIMITER $$

CREATE TRIGGER `trg_plant_knowledge_release_no_update`
BEFORE UPDATE ON `plant_knowledge_releases`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Plant knowledge release is immutable; create a new release';
END$$

CREATE TRIGGER `trg_plant_knowledge_release_no_delete`
BEFORE DELETE ON `plant_knowledge_releases`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Plant knowledge release cannot be deleted';
END$$

CREATE TRIGGER `trg_plant_knowledge_release_item_no_update`
BEFORE UPDATE ON `plant_knowledge_release_items`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Plant knowledge release item is immutable; create a new release';
END$$

CREATE TRIGGER `trg_plant_knowledge_release_item_no_delete`
BEFORE DELETE ON `plant_knowledge_release_items`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Plant knowledge release item cannot be deleted';
END$$

DELIMITER ;
