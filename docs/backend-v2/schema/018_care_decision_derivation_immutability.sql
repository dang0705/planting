-- 养护决策派生不可变保护：在 017 建表后执行，不修改已应用的 017。
-- 字段映射与计数：不改列、不搬迁记录；执行前后记录数必须相同。
-- 验收：任意 UPDATE（包括写回原值）失败；既有结果读回保持一致。
-- CREATE TRIGGER 失败不修改行数据；生产回退必须停写并另行批准，不能静默解除保护。

DELIMITER $$
CREATE TRIGGER `trg_care_decision_derivations_reject_update`
BEFORE UPDATE ON `care_decision_derivations`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '养护决策派生不可修改，请使用新算法 release 追加结果';
END$$
DELIMITER ;
