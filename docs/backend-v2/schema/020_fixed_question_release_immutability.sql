-- 固定题包发布不可改写增量；只增加触发器，不搬运、修正或删除既有记录。
-- 依赖007业务策略表。生产执行须另行获准；不得由HTTP启动执行。
DELIMITER $$
CREATE TRIGGER `qhz_fixed_question_release_immutable_update`
BEFORE UPDATE ON `business_policy_releases`
FOR EACH ROW
BEGIN
  IF OLD.status IN ('verified','active','retired') AND (
    (BINARY OLD.domain_code=BINARY 'diagnosis' AND BINARY OLD.policy_code=BINARY 'fixed_question_packages') OR
    (BINARY NEW.domain_code=BINARY 'diagnosis' AND BINARY NEW.policy_code=BINARY 'fixed_question_packages')
  ) THEN
    IF NOT (NEW.id <=> OLD.id)
       OR NOT (BINARY NEW._openid <=> BINARY OLD._openid)
       OR NOT (BINARY NEW.release_ref <=> BINARY OLD.release_ref)
       OR NOT (BINARY NEW.domain_code <=> BINARY OLD.domain_code)
       OR NOT (BINARY NEW.policy_code <=> BINARY OLD.policy_code)
       OR NOT (BINARY NEW.schema_version <=> BINARY OLD.schema_version)
       OR NOT (BINARY NEW.release_version <=> BINARY OLD.release_version)
       OR NOT (BINARY NEW.content_sha256 <=> BINARY OLD.content_sha256)
       OR NOT (NEW.policy_json <=> OLD.policy_json)
       OR NOT (NEW.effective_at_ms <=> OLD.effective_at_ms)
       OR NOT (NEW.expires_at_ms <=> OLD.expires_at_ms)
       OR NOT (NEW.verified_at_ms <=> OLD.verified_at_ms)
       OR NOT (NEW.created_at_ms <=> OLD.created_at_ms)
    THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='已验证固定题包发布不可改写';
    END IF;
    IF NEW.status NOT IN ('verified','active','retired')
       OR (OLD.status IN ('active','retired') AND NEW.status='verified')
    THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='固定题包发布不能降级审核状态';
    END IF;
  END IF;
END$$
CREATE TRIGGER `qhz_fixed_question_release_immutable_delete`
BEFORE DELETE ON `business_policy_releases`
FOR EACH ROW
BEGIN
  IF BINARY OLD.domain_code=BINARY 'diagnosis'
     AND BINARY OLD.policy_code=BINARY 'fixed_question_packages'
     AND OLD.status IN ('verified','active','retired')
  THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='已验证固定题包发布不可删除';
  END IF;
END$$
DELIMITER ;

-- 失败回退仅限未切换且获准的迁移环境：删除上述两个触发器。
-- 回退后不可宣称数据库不可改写保护已经验收；业务版本回滚应切换active指针。
