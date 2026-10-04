-- 青花植后端 v2 / identity 域会话策略快照补充。
-- 该迁移只增加签发时的策略追溯字段，不修改既有身份或会话状态语义。

ALTER TABLE `user_sessions`
  ADD COLUMN `session_policy_release_version` VARCHAR(100) NOT NULL
    COMMENT '签发本次会话时锁定的身份策略发布版本',
  ADD COLUMN `session_policy_snapshot_sha256` CHAR(64) NOT NULL
    COMMENT '签发本次会话时锁定的请求策略快照 SHA-256；不包含策略正文',
  ADD CONSTRAINT `ck_user_session_policy_release_version`
    CHECK (REGEXP_LIKE(`session_policy_release_version`, '^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$', 'c')),
  ADD CONSTRAINT `ck_user_session_policy_snapshot_sha256`
    CHECK (REGEXP_LIKE(`session_policy_snapshot_sha256`, '^[0-9a-f]{64}$', 'c'));
