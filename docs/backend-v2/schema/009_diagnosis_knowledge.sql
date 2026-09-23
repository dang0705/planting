-- 青花植后端 v2 / 诊断知识独立治理空库 DDL。
-- 仅 diagnosis 服务端可写；CMS 草稿和审核凭据不得被运行时直接读取。
-- 本迁移只建结构，不导入旧题包、园艺结论或行动文案。

CREATE TABLE `diagnosis_sources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '来源内部主键，不进入公开响应',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `source_code` VARCHAR(96) NOT NULL COMMENT '稳定来源代码；不得改指另一篇资料',
  `organization_zh` VARCHAR(191) NOT NULL COMMENT '来源机构或作者的中文说明',
  `title_zh` VARCHAR(255) NOT NULL COMMENT '资料标题的中文说明',
  `locator_url` VARCHAR(1024) NOT NULL COMMENT '可追溯原文定位链接',
  `source_type` VARCHAR(32) NOT NULL COMMENT '资料类型，例如机构指导或园艺文献',
  `license_scope` VARCHAR(32) NOT NULL COMMENT '资料许可与可公开引用范围',
  `source_state` VARCHAR(24) NOT NULL COMMENT '来源状态：待核验、可用或已撤回',
  `verified_at_ms` BIGINT UNSIGNED NULL COMMENT '最近核验资料有效性的 UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_source_code` (`source_code`),
  CONSTRAINT `ck_diag_source_state` CHECK (`source_state` IN ('pending', 'verified', 'withdrawn'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='诊断知识资料来源';

CREATE TABLE `diagnosis_source_claim_revisions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '来源主张修订内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `source_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '对应诊断来源内部主键',
  `claim_code` VARCHAR(96) NOT NULL COMMENT '同一来源内稳定的具体主张代码',
  `revision_no` INT UNSIGNED NOT NULL COMMENT '主张修订号；新证据只能增加修订',
  `source_locator` VARCHAR(1024) NOT NULL COMMENT '原资料中支持此主张的章节或段落定位',
  `claim_zh` TEXT NOT NULL COMMENT '受审中文主张，不得原地改写历史修订',
  `applicability_json` JSON NOT NULL COMMENT '强类型 Schema 校验后的适用植物与场景',
  `claim_role` VARCHAR(24) NOT NULL COMMENT '主张角色：支持、反驳、限制或安全',
  `evidence_sha256` CHAR(64) NOT NULL COMMENT '被审核证据制品的 SHA-256',
  `verified_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '该修订人工核验时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '修订创建时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_claim_revision` (`source_internal_id`, `claim_code`, `revision_no`),
  KEY `idx_diag_claim_source` (`source_internal_id`),
  CONSTRAINT `fk_diag_claim_source` FOREIGN KEY (`source_internal_id`) REFERENCES `diagnosis_sources` (`id`),
  CONSTRAINT `ck_diag_claim_role` CHECK (`claim_role` IN ('support', 'oppose', 'limit', 'safety'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='诊断资料的具体主张及不可覆盖修订';

CREATE TABLE `diagnosis_knowledge_candidates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '诊断知识候选内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `candidate_ref` VARCHAR(96) NOT NULL COMMENT '候选公开引用；审核必须绑定本引用及内容摘要',
  `bundle_code` VARCHAR(96) NOT NULL COMMENT '兼容知识包业务代码',
  `revision_no` INT UNSIGNED NOT NULL COMMENT '知识包候选修订号',
  `schema_version` VARCHAR(48) NOT NULL COMMENT '候选完整内容的结构版本',
  `content_sha256` CHAR(64) NOT NULL COMMENT '规范化完整待审内容 SHA-256',
  `candidate_json` JSON NOT NULL COMMENT '不可变完整候选快照，须由版本化 Schema 校验',
  `candidate_state` VARCHAR(24) NOT NULL COMMENT '候选状态：草稿、待审核、驳回或已审核',
  `submitted_at_ms` BIGINT UNSIGNED NULL COMMENT '提交审核时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '候选创建时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_candidate_ref` (`candidate_ref`),
  UNIQUE KEY `uq_diag_candidate_revision` (`bundle_code`, `revision_no`),
  UNIQUE KEY `uq_diag_candidate_hash_ref` (`id`, `content_sha256`),
  UNIQUE KEY `uq_diag_candidate_bundle_hash` (`id`, `bundle_code`, `content_sha256`),
  CONSTRAINT `ck_diag_candidate_state` CHECK (`candidate_state` IN ('draft', 'submitted', 'rejected', 'reviewed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='绑定完整内容摘要的诊断知识候选';

CREATE TABLE `diagnosis_cause_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '园艺原因条目内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `candidate_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属诊断知识候选修订',
  `cause_code` VARCHAR(96) NOT NULL COMMENT '同一候选中的稳定园艺原因代码',
  `parent_cause_code` VARCHAR(96) NULL COMMENT '同一候选内的上级原因代码',
  `cause_category` VARCHAR(32) NOT NULL COMMENT '非生物、害虫、病原、混合或待判定分类',
  `display_name_zh` VARCHAR(191) NOT NULL COMMENT '经审核的中文园艺原因名称',
  `applicable_plant_scope_json` JSON NOT NULL COMMENT '强类型 Schema 校验后的植物适用范围',
  `definition_json` JSON NOT NULL COMMENT '强类型 Schema 校验后的原因定义',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_cause_in_candidate` (`candidate_internal_id`, `cause_code`),
  KEY `idx_diag_cause_parent` (`candidate_internal_id`, `parent_cause_code`),
  CONSTRAINT `fk_diag_cause_candidate` FOREIGN KEY (`candidate_internal_id`) REFERENCES `diagnosis_knowledge_candidates` (`id`),
  CONSTRAINT `fk_diag_cause_parent` FOREIGN KEY (`candidate_internal_id`, `parent_cause_code`) REFERENCES `diagnosis_cause_entries` (`candidate_internal_id`, `cause_code`),
  CONSTRAINT `ck_diag_cause_category` CHECK (`cause_category` IN ('abiotic', 'pest', 'pathogen', 'mixed', 'undetermined'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='与症状入口分离的园艺原因目录';

CREATE TABLE `diagnosis_outcome_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '诊断结论条目内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `candidate_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属诊断知识候选修订',
  `outcome_code` VARCHAR(96) NOT NULL COMMENT '同一候选中的稳定结论代码',
  `cause_code` VARCHAR(96) NOT NULL COMMENT '同一候选内的园艺原因代码',
  `display_name_zh` VARCHAR(191) NOT NULL COMMENT '经审核的中文结论名称',
  `summary_zh` TEXT NOT NULL COMMENT '经审核的有界结论摘要',
  `problem_type_code` VARCHAR(64) NOT NULL COMMENT '原因分类对应的用户可理解问题类型',
  `symptom_mode_codes_json` JSON NOT NULL COMMENT '可进入本结论的症状题包代码',
  `affected_part_scope_json` JSON NOT NULL COMMENT '适用的叶、茎、根等受损部位范围',
  `applicable_plant_scope_json` JSON NOT NULL COMMENT '适用及排除的植物身份范围',
  `evidence_rules_json` JSON NOT NULL COMMENT '必须、支持和反驳证据及其覆盖范围',
  `conflict_policy_json` JSON NOT NULL COMMENT '证据冲突时的降级或并列规则',
  `uncertainty_policy_json` JSON NOT NULL COMMENT '可能、待确认及禁止确诊的条件',
  `severity_criteria_json` JSON NOT NULL COMMENT '受损范围和程度的分级依据',
  `urgency_policy_json` JSON NOT NULL COMMENT '处理紧急程度的判定条件',
  `isolation_policy_json` JSON NOT NULL COMMENT '是否隔离或待确认的判定条件',
  `differential_outcomes_json` JSON NOT NULL COMMENT '需鉴别的同包其他结论代码',
  `follow_up_criteria_json` JSON NOT NULL COMMENT '复查观察点及恶化条件',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_outcome_in_candidate` (`candidate_internal_id`, `outcome_code`),
  KEY `idx_diag_outcome_cause` (`candidate_internal_id`, `cause_code`),
  CONSTRAINT `fk_diag_outcome_cause` FOREIGN KEY (`candidate_internal_id`, `cause_code`) REFERENCES `diagnosis_cause_entries` (`candidate_internal_id`, `cause_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='经审核的诊断结论与证据门';

CREATE TABLE `diagnosis_action_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '行动建议条目内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `candidate_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属诊断知识候选修订',
  `action_code` VARCHAR(96) NOT NULL COMMENT '同一候选中的稳定行动代码',
  `display_category` VARCHAR(24) NOT NULL COMMENT '立即处理、后续养护、预防或注意事项',
  `title_zh` VARCHAR(191) NOT NULL COMMENT '经审核的中文行动名称',
  `purpose_zh` TEXT NOT NULL COMMENT '行动目的及给出该建议的理由',
  `steps_json` JSON NOT NULL COMMENT '经独立审核的逐步操作说明',
  `applicability_json` JSON NOT NULL COMMENT '植物、部位、环境和证据适用条件',
  `contraindications_json` JSON NOT NULL COMMENT '不得执行本行动的禁忌条件',
  `stop_conditions_json` JSON NOT NULL COMMENT '暂停或升级处置条件',
  `risk_level` VARCHAR(24) NOT NULL COMMENT '行动风险级别',
  `safety_notes_zh` TEXT NOT NULL COMMENT '面向用户的受审安全说明',
  `follow_up_criteria_json` JSON NOT NULL COMMENT '复查观察点及有依据的时间条件',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_action_in_candidate` (`candidate_internal_id`, `action_code`),
  CONSTRAINT `fk_diag_action_candidate` FOREIGN KEY (`candidate_internal_id`) REFERENCES `diagnosis_knowledge_candidates` (`id`),
  CONSTRAINT `ck_diag_action_category` CHECK (`display_category` IN ('immediate', 'aftercare', 'prevention', 'caution')),
  CONSTRAINT `ck_diag_action_risk` CHECK (`risk_level` IN ('low', 'moderate', 'high'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='可独立审核与撤回的诊断行动知识';

CREATE TABLE `diagnosis_outcome_action_mappings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '结论与行动映射内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `candidate_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属诊断知识候选修订',
  `mapping_code` VARCHAR(96) NOT NULL COMMENT '同一候选中的稳定映射代码',
  `outcome_code` VARCHAR(96) NOT NULL COMMENT '同一候选内的结论代码',
  `action_code` VARCHAR(96) NOT NULL COMMENT '同一候选内的行动代码',
  `matching_conditions_json` JSON NOT NULL COMMENT '本次结果可选用行动的具体证据条件',
  `contraindication_priority` SMALLINT UNSIGNED NOT NULL COMMENT '禁忌优先级，命中时先于行动推荐生效',
  `sequence_no` SMALLINT UNSIGNED NOT NULL COMMENT '行动展示与执行建议顺序',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_mapping_in_candidate` (`candidate_internal_id`, `mapping_code`),
  KEY `idx_diag_mapping_outcome` (`candidate_internal_id`, `outcome_code`),
  KEY `idx_diag_mapping_action` (`candidate_internal_id`, `action_code`),
  CONSTRAINT `fk_diag_mapping_outcome` FOREIGN KEY (`candidate_internal_id`, `outcome_code`) REFERENCES `diagnosis_outcome_entries` (`candidate_internal_id`, `outcome_code`),
  CONSTRAINT `fk_diag_mapping_action` FOREIGN KEY (`candidate_internal_id`, `action_code`) REFERENCES `diagnosis_action_entries` (`candidate_internal_id`, `action_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='同版结论与行动的受审适用映射';

CREATE TABLE `diagnosis_claim_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '知识条目与来源主张关联内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `candidate_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属诊断知识候选修订',
  `claim_revision_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '精确来源主张修订，不指向可变的最新主张',
  `target_kind` VARCHAR(24) NOT NULL COMMENT '被引用的原因、结论、行动或结论行动映射类型',
  `cause_code` VARCHAR(96) NULL COMMENT '目标为原因时，同候选的稳定代码',
  `outcome_code` VARCHAR(96) NULL COMMENT '目标为结论时，同候选的稳定代码',
  `action_code` VARCHAR(96) NULL COMMENT '目标为行动时，同候选的稳定代码',
  `mapping_code` VARCHAR(96) NULL COMMENT '目标为映射时，同候选的稳定代码',
  `link_role` VARCHAR(24) NOT NULL COMMENT '该主张对目标的支持、反驳、限制或安全作用',
  PRIMARY KEY (`id`),
  KEY `idx_diag_link_claim` (`claim_revision_internal_id`),
  KEY `idx_diag_link_cause` (`candidate_internal_id`, `cause_code`),
  KEY `idx_diag_link_outcome` (`candidate_internal_id`, `outcome_code`),
  KEY `idx_diag_link_action` (`candidate_internal_id`, `action_code`),
  KEY `idx_diag_link_mapping` (`candidate_internal_id`, `mapping_code`),
  CONSTRAINT `fk_diag_link_claim` FOREIGN KEY (`claim_revision_internal_id`) REFERENCES `diagnosis_source_claim_revisions` (`id`),
  CONSTRAINT `fk_diag_link_cause` FOREIGN KEY (`candidate_internal_id`, `cause_code`) REFERENCES `diagnosis_cause_entries` (`candidate_internal_id`, `cause_code`),
  CONSTRAINT `fk_diag_link_outcome` FOREIGN KEY (`candidate_internal_id`, `outcome_code`) REFERENCES `diagnosis_outcome_entries` (`candidate_internal_id`, `outcome_code`),
  CONSTRAINT `fk_diag_link_action` FOREIGN KEY (`candidate_internal_id`, `action_code`) REFERENCES `diagnosis_action_entries` (`candidate_internal_id`, `action_code`),
  CONSTRAINT `fk_diag_link_mapping` FOREIGN KEY (`candidate_internal_id`, `mapping_code`) REFERENCES `diagnosis_outcome_action_mappings` (`candidate_internal_id`, `mapping_code`),
  CONSTRAINT `ck_diag_link_role` CHECK (`link_role` IN ('support', 'oppose', 'limit', 'safety')),
  CONSTRAINT `ck_diag_link_target` CHECK (
    (`target_kind` = 'cause' AND `cause_code` IS NOT NULL AND `outcome_code` IS NULL AND `action_code` IS NULL AND `mapping_code` IS NULL)
    OR (`target_kind` = 'outcome' AND `cause_code` IS NULL AND `outcome_code` IS NOT NULL AND `action_code` IS NULL AND `mapping_code` IS NULL)
    OR (`target_kind` = 'action' AND `cause_code` IS NULL AND `outcome_code` IS NULL AND `action_code` IS NOT NULL AND `mapping_code` IS NULL)
    OR (`target_kind` = 'mapping' AND `cause_code` IS NULL AND `outcome_code` IS NULL AND `action_code` IS NULL AND `mapping_code` IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='逐项可核验的诊断来源主张关联';

CREATE TABLE `diagnosis_review_attestations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '受控人工审核凭据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `review_ref` VARCHAR(96) NOT NULL COMMENT 'CMS 受控审核引用；重复引用必须幂等',
  `reviewer_ref_hash` CHAR(64) NOT NULL COMMENT '审核主体引用的不可逆摘要，不保存原始身份',
  `candidate_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '被审核的候选内部主键',
  `content_sha256` CHAR(64) NOT NULL COMMENT '审核时完整候选内容 SHA-256，须与候选完全一致',
  `decision` VARCHAR(16) NOT NULL COMMENT '审核决定：通过或驳回',
  `protocol_version` VARCHAR(48) NOT NULL COMMENT 'CMS 与诊断域审核交换协议版本',
  `decided_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '人工审核决定时间，UTC 毫秒',
  `revoked_at_ms` BIGINT UNSIGNED NULL COMMENT '审核凭据撤销时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_review_ref` (`review_ref`),
  UNIQUE KEY `uq_diag_review_approved_ref` (`id`, `candidate_internal_id`, `content_sha256`, `decision`),
  KEY `idx_diag_review_candidate_hash` (`candidate_internal_id`, `content_sha256`),
  CONSTRAINT `fk_diag_review_candidate` FOREIGN KEY (`candidate_internal_id`, `content_sha256`) REFERENCES `diagnosis_knowledge_candidates` (`id`, `content_sha256`),
  CONSTRAINT `ck_diag_review_decision` CHECK (`decision` IN ('approved', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='绑定确切完整内容摘要的人工审核凭据';

CREATE TABLE `diagnosis_knowledge_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '诊断知识发布包内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `release_ref` VARCHAR(96) NOT NULL COMMENT '不可变发布包公开引用',
  `bundle_code` VARCHAR(96) NOT NULL COMMENT '对应兼容知识包业务代码',
  `version` INT UNSIGNED NOT NULL COMMENT '同一知识包内单调递增的发布版本',
  `candidate_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '来源候选修订内部主键',
  `candidate_content_sha256` CHAR(64) NOT NULL COMMENT '发布所据完整候选内容摘要',
  `review_attestation_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '准入时使用的受控人工审核凭据',
  `review_decision` VARCHAR(16) NOT NULL DEFAULT 'approved' COMMENT '发布只能引用通过的审核决定，数据库固定为 approved',
  `schema_version` VARCHAR(48) NOT NULL COMMENT '完整发布包的结构版本',
  `package_json` JSON NOT NULL COMMENT '可供历史回放的完整不可变兼容知识包',
  `package_sha256` CHAR(64) NOT NULL COMMENT '规范化完整发布包 SHA-256',
  `release_state` VARCHAR(16) NOT NULL COMMENT '发布状态：可用或已撤回',
  `published_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '发布时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_release_ref` (`release_ref`),
  UNIQUE KEY `uq_diag_release_version` (`bundle_code`, `version`),
  UNIQUE KEY `uq_diag_release_hash` (`bundle_code`, `package_sha256`),
  UNIQUE KEY `uq_diag_release_bundle_id` (`bundle_code`, `id`),
  KEY `idx_diag_release_candidate_hash` (`candidate_internal_id`, `bundle_code`, `candidate_content_sha256`),
  KEY `idx_diag_release_review` (`review_attestation_internal_id`, `candidate_internal_id`, `candidate_content_sha256`, `review_decision`),
  CONSTRAINT `fk_diag_release_candidate` FOREIGN KEY (`candidate_internal_id`, `bundle_code`, `candidate_content_sha256`) REFERENCES `diagnosis_knowledge_candidates` (`id`, `bundle_code`, `content_sha256`),
  CONSTRAINT `fk_diag_release_review` FOREIGN KEY (`review_attestation_internal_id`, `candidate_internal_id`, `candidate_content_sha256`, `review_decision`) REFERENCES `diagnosis_review_attestations` (`id`, `candidate_internal_id`, `content_sha256`, `decision`),
  CONSTRAINT `ck_diag_release_review_approved` CHECK (`review_decision` = 'approved'),
  CONSTRAINT `ck_diag_release_state` CHECK (`release_state` IN ('published', 'withdrawn'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='可回放的不可变诊断知识发布包';

CREATE TABLE `active_diagnosis_knowledge_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '活动发布指针内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `bundle_code` VARCHAR(96) NOT NULL COMMENT '同一兼容知识包的唯一活动范围',
  `release_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '当前激活的已审核发布包内部主键',
  `version` INT UNSIGNED NOT NULL COMMENT '乐观并发切换版本，更新时必须比较旧值',
  `activated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '当前发布包激活时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_active_bundle` (`bundle_code`),
  KEY `idx_diag_active_release` (`bundle_code`, `release_internal_id`),
  CONSTRAINT `fk_diag_active_release` FOREIGN KEY (`bundle_code`, `release_internal_id`) REFERENCES `diagnosis_knowledge_releases` (`bundle_code`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每一兼容包范围唯一的诊断知识活动指针';

CREATE TABLE `diagnosis_release_activation_audit` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '发布切换审计内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `command_ref` VARCHAR(96) NOT NULL COMMENT '发布或回滚命令的幂等引用',
  `operator_ref_hash` CHAR(64) NOT NULL COMMENT '受控操作主体引用的不可逆摘要',
  `bundle_code` VARCHAR(96) NOT NULL COMMENT '受影响的兼容知识包业务代码',
  `previous_release_internal_id` BIGINT UNSIGNED NULL COMMENT '切换前发布包内部主键；首次激活为空',
  `new_release_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '切换后发布包内部主键',
  `expected_pointer_version` INT UNSIGNED NOT NULL COMMENT '命令要求的活动指针旧版本',
  `action_kind` VARCHAR(16) NOT NULL COMMENT '激活或回滚',
  `reason_zh` VARCHAR(500) NOT NULL COMMENT '操作原因与审计说明',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '切换审计生成时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_activation_command` (`command_ref`),
  KEY `idx_diag_audit_previous` (`bundle_code`, `previous_release_internal_id`),
  KEY `idx_diag_audit_new` (`bundle_code`, `new_release_internal_id`),
  CONSTRAINT `fk_diag_audit_previous` FOREIGN KEY (`bundle_code`, `previous_release_internal_id`) REFERENCES `diagnosis_knowledge_releases` (`bundle_code`, `id`),
  CONSTRAINT `fk_diag_audit_new` FOREIGN KEY (`bundle_code`, `new_release_internal_id`) REFERENCES `diagnosis_knowledge_releases` (`bundle_code`, `id`),
  CONSTRAINT `ck_diag_audit_action` CHECK (`action_kind` IN ('activate', 'rollback'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='诊断知识激活与回滚的追加审计';
