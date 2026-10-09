-- 027：养护事实不可修改保护（long-term-care/v1 §10）。在 004 建表后执行，不修改已应用迁移、不改列、不搬迁记录。
-- 只拒绝 UPDATE（包括写回原值）；删除只由数据保留/删除流程执行，故不拦截 DELETE。
-- 更正事实须追加新事实；生产回退必须停写并另行批准，不能静默解除保护。

DELIMITER $$
CREATE TRIGGER `trg_care_facts_reject_update`
BEFORE UPDATE ON `care_facts`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '养护事实不可修改，请追加更正事实';
END$$
DELIMITER ;
