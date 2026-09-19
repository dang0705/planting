-- 青花植后端 v2 / plant-knowledge 域空库 DDL。
-- 分类事实、产品身份、展示百科和内部知识分层存储。

CREATE TABLE `plant_taxa` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '权威分类实体内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `public_taxon_ref` VARCHAR(64) NOT NULL COMMENT '高熵分类实体公开引用',
  `authority_source` VARCHAR(24) NOT NULL COMMENT '权威来源：POWO、WCVP、WFO、RHS_ICRA',
  `authority_taxon_id` VARCHAR(128) NOT NULL COMMENT '权威来源稳定分类标识',
  `accepted_scientific_name` VARCHAR(255) NOT NULL COMMENT '接受学名及作者串',
  `taxon_rank` VARCHAR(32) NOT NULL COMMENT '分类等级',
  `nomenclatural_status` VARCHAR(24) NOT NULL COMMENT '命名状态：accepted、synonym',
  `parent_taxon_internal_id` BIGINT UNSIGNED NULL COMMENT '父级分类实体内部主键',
  `source_version` VARCHAR(128) NOT NULL COMMENT '权威来源版本或发布日期',
  `retrieved_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '证据获取时间，UTC 毫秒',
  `evidence_hash` CHAR(64) NOT NULL COMMENT '权威原始证据 SHA-256',
  `review_status` VARCHAR(24) NOT NULL COMMENT '审核状态：ACTIVE、QUARANTINE、REJECTED',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_taxon_public_ref` (`public_taxon_ref`),
  UNIQUE KEY `uq_taxon_authority` (`authority_source`, `authority_taxon_id`),
  UNIQUE KEY `uq_taxon_authority_binding` (`id`, `authority_source`, `authority_taxon_id`),
  KEY `idx_taxon_parent_rank` (`parent_taxon_internal_id`, `taxon_rank`),
  KEY `idx_taxon_review` (`review_status`, `taxon_rank`),
  CONSTRAINT `ck_taxon_authority_source` CHECK (`authority_source` IN ('POWO', 'WCVP', 'WFO', 'RHS_ICRA')),
  CONSTRAINT `ck_taxon_rank` CHECK (`taxon_rank` IN ('family', 'genus', 'species', 'subspecies', 'variety', 'form', 'hybrid', 'cultivar', 'species_group')),
  CONSTRAINT `ck_taxon_nomenclatural_status` CHECK (`nomenclatural_status` IN ('accepted', 'synonym')),
  CONSTRAINT `ck_taxon_review_status` CHECK (`review_status` IN ('ACTIVE', 'QUARANTINE', 'REJECTED')),
  CONSTRAINT `ck_taxon_species_not_placeholder` CHECK (`taxon_rank` <> 'species' OR (LOWER(`accepted_scientific_name`) NOT LIKE '% spp.%' AND LOWER(`accepted_scientific_name`) NOT LIKE '% spp')),
  CONSTRAINT `ck_taxon_spp_rank` CHECK ((LOWER(`accepted_scientific_name`) NOT LIKE '% spp.%' AND LOWER(`accepted_scientific_name`) NOT LIKE '% spp') OR `taxon_rank` IN ('genus', 'species_group')),
  CONSTRAINT `fk_taxon_parent` FOREIGN KEY (`parent_taxon_internal_id`) REFERENCES `plant_taxa` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 权威植物分类实体';

CREATE TABLE `plant_taxon_authority_evidence` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类权威证据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `taxon_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联权威分类实体',
  `evidence_ref` VARCHAR(64) NOT NULL COMMENT '高熵分类证据引用',
  `authority_source` VARCHAR(24) NOT NULL COMMENT '权威来源代码',
  `authority_taxon_id` VARCHAR(128) NOT NULL COMMENT '来源稳定分类标识',
  `source_version` VARCHAR(128) NOT NULL COMMENT '来源版本或发布日期',
  `source_url` VARCHAR(512) NOT NULL COMMENT '权威来源请求 URL',
  `raw_artifact_ref` VARCHAR(512) NOT NULL COMMENT '受控原始响应制品引用',
  `raw_artifact_sha256` CHAR(64) NOT NULL COMMENT '原始响应字节 SHA-256',
  `evidence_status` VARCHAR(24) NOT NULL COMMENT '证据状态：verified、invalid、superseded',
  `retrieved_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '证据获取时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_taxon_authority_evidence_ref` (`evidence_ref`),
  UNIQUE KEY `uq_taxon_authority_artifact` (`taxon_internal_id`, `raw_artifact_sha256`),
  KEY `idx_taxon_authority_evidence_binding` (`taxon_internal_id`, `authority_source`, `authority_taxon_id`),
  CONSTRAINT `ck_taxon_authority_evidence_source` CHECK (`authority_source` IN ('POWO', 'WCVP', 'WFO', 'RHS_ICRA')),
  CONSTRAINT `ck_taxon_evidence_status` CHECK (`evidence_status` IN ('verified', 'invalid', 'superseded')),
  CONSTRAINT `fk_taxon_authority_evidence_owner` FOREIGN KEY (`taxon_internal_id`) REFERENCES `plant_taxa` (`id`),
  CONSTRAINT `fk_taxon_authority_evidence_binding` FOREIGN KEY (`taxon_internal_id`, `authority_source`, `authority_taxon_id`) REFERENCES `plant_taxa` (`id`, `authority_source`, `authority_taxon_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 分类实体权威原始证据';

CREATE TABLE `plant_taxon_reviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类实体审核裁决内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `taxon_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联权威分类实体',
  `review_ref` VARCHAR(64) NOT NULL COMMENT '高熵分类审核引用',
  `review_version` VARCHAR(64) NOT NULL COMMENT '不可变审核规则版本',
  `decision` VARCHAR(24) NOT NULL COMMENT '裁决：ACTIVE、QUARANTINE、REJECTED',
  `quarantine_reason` VARCHAR(64) NULL COMMENT '隔离原因代码',
  `decision_evidence_json` JSON NOT NULL COMMENT '裁决引用的证据和父链最小清单',
  `parent_chain_sha256` CHAR(64) NOT NULL COMMENT '完整父链规范化清单 SHA-256',
  `decision_sha256` CHAR(64) NOT NULL COMMENT '规范化裁决内容 SHA-256',
  `reviewer_ref` VARCHAR(64) NOT NULL COMMENT '受控审核主体引用',
  `reviewed_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '审核时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_taxon_review_ref` (`review_ref`),
  UNIQUE KEY `uq_taxon_review_version` (`taxon_internal_id`, `review_version`),
  CONSTRAINT `ck_taxon_review_decision` CHECK (`decision` IN ('ACTIVE', 'QUARANTINE', 'REJECTED')),
  CONSTRAINT `fk_taxon_review_owner` FOREIGN KEY (`taxon_internal_id`) REFERENCES `plant_taxa` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 分类实体人工审核裁决';

CREATE TABLE `plant_taxon_names` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类名称内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `taxon_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联权威分类实体',
  `name_type` VARCHAR(24) NOT NULL COMMENT '名称类型：accepted、synonym、common、market',
  `language_code` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '语言代码，学名为空',
  `normalized_name` VARCHAR(255) NOT NULL COMMENT '规范化检索名称',
  `display_name` VARCHAR(255) NOT NULL COMMENT '保留原始拼写的展示名称',
  `authority_source` VARCHAR(24) NULL COMMENT '名称证据来源',
  `authority_name_id` VARCHAR(128) NULL COMMENT '来源名称稳定标识',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_taxon_name` (`taxon_internal_id`, `name_type`, `normalized_name`, `language_code`),
  KEY `idx_taxon_name_lookup` (`normalized_name`, `language_code`),
  CONSTRAINT `ck_taxon_name_type` CHECK (`name_type` IN ('accepted', 'synonym', 'common', 'market')),
  CONSTRAINT `fk_taxon_name_taxon` FOREIGN KEY (`taxon_internal_id`) REFERENCES `plant_taxa` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 分类名称与异名';

CREATE TABLE `plant_taxon_relations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类关系内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `from_taxon_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关系起点分类实体',
  `to_taxon_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关系终点分类实体',
  `relation_type` VARCHAR(32) NOT NULL COMMENT '关系类型：parent、accepted_for、hybrid_parent',
  `evidence_hash` CHAR(64) NOT NULL COMMENT '关系证据 SHA-256',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_taxon_relation` (`from_taxon_internal_id`, `to_taxon_internal_id`, `relation_type`),
  CONSTRAINT `ck_taxon_relation_type` CHECK (`relation_type` IN ('parent', 'accepted_for', 'hybrid_parent')),
  CONSTRAINT `fk_taxon_relation_from` FOREIGN KEY (`from_taxon_internal_id`) REFERENCES `plant_taxa` (`id`),
  CONSTRAINT `fk_taxon_relation_to` FOREIGN KEY (`to_taxon_internal_id`) REFERENCES `plant_taxa` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 分类实体关系';

CREATE TABLE `plant_taxon_relation_evidence` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类关系证据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `taxon_relation_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联分类关系边',
  `authority_source` VARCHAR(24) NOT NULL COMMENT '关系证据权威来源',
  `source_version` VARCHAR(128) NOT NULL COMMENT '来源版本或发布日期',
  `raw_artifact_ref` VARCHAR(512) NOT NULL COMMENT '受控原始关系证据制品引用',
  `raw_artifact_sha256` CHAR(64) NOT NULL COMMENT '原始关系证据 SHA-256',
  `relation_order` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '同类父级关系的稳定顺序',
  `review_status` VARCHAR(24) NOT NULL COMMENT '审核状态：ACTIVE、QUARANTINE、REJECTED',
  `review_ref` VARCHAR(64) NOT NULL COMMENT '支撑本关系的分类审核引用',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_taxon_relation_evidence` (`taxon_relation_internal_id`, `raw_artifact_sha256`),
  CONSTRAINT `ck_taxon_relation_evidence_source` CHECK (`authority_source` IN ('POWO', 'WCVP', 'WFO', 'RHS_ICRA')),
  CONSTRAINT `ck_taxon_relation_review_status` CHECK (`review_status` IN ('ACTIVE', 'QUARANTINE', 'REJECTED')),
  CONSTRAINT `fk_taxon_relation_evidence_owner` FOREIGN KEY (`taxon_relation_internal_id`) REFERENCES `plant_taxon_relations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 分类关系边权威证据';

CREATE TABLE `plant_identities` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '产品植物身份内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `public_identity_ref` VARCHAR(64) NOT NULL COMMENT '高熵产品身份公开引用',
  `primary_taxon_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '主要权威分类实体',
  `display_name_zh` VARCHAR(128) NOT NULL COMMENT '中文一等公民展示名',
  `identity_kind` VARCHAR(24) NOT NULL COMMENT '身份类型：taxon、cultivar、product_group',
  `review_status` VARCHAR(24) NOT NULL COMMENT '审核状态：ACTIVE、QUARANTINE、REJECTED',
  `active_release_internal_id` BIGINT UNSIGNED NULL COMMENT '当前不可变发布版本内部主键',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plant_identity_ref` (`public_identity_ref`),
  KEY `idx_plant_identity_taxon` (`primary_taxon_internal_id`, `review_status`),
  CONSTRAINT `ck_plant_identity_review_status` CHECK (`review_status` IN ('ACTIVE', 'QUARANTINE', 'REJECTED')),
  CONSTRAINT `ck_plant_identity_quarantine_release` CHECK (`review_status` = 'ACTIVE' OR `active_release_internal_id` IS NULL),
  CONSTRAINT `fk_plant_identity_taxon` FOREIGN KEY (`primary_taxon_internal_id`) REFERENCES `plant_taxa` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 产品植物身份';

CREATE TABLE `plant_identity_taxa` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '产品身份与分类实体关系内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `plant_identity_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联产品植物身份',
  `taxon_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联权威分类实体',
  `relation_role` VARCHAR(24) NOT NULL COMMENT '关系角色：primary、parent、hybrid_parent、cultivar_parent',
  `decision_ref` VARCHAR(64) NOT NULL COMMENT '支撑该映射的审核裁决引用',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_identity_taxon_role` (`plant_identity_internal_id`, `taxon_internal_id`, `relation_role`),
  CONSTRAINT `ck_identity_taxon_role` CHECK (`relation_role` IN ('primary', 'parent', 'hybrid_parent', 'cultivar_parent')),
  CONSTRAINT `fk_identity_taxon_identity` FOREIGN KEY (`plant_identity_internal_id`) REFERENCES `plant_identities` (`id`),
  CONSTRAINT `fk_identity_taxon_taxon` FOREIGN KEY (`taxon_internal_id`) REFERENCES `plant_taxa` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 产品身份到分类实体的可审计映射';

CREATE TABLE `plant_identity_aliases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '产品身份别名内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `plant_identity_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联产品植物身份',
  `alias_type` VARCHAR(24) NOT NULL COMMENT '别名类型：common、market、provider',
  `normalized_alias` VARCHAR(255) NOT NULL COMMENT '规范化别名',
  `display_alias` VARCHAR(255) NOT NULL COMMENT '原始展示别名',
  `source_provider` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '供应商来源，普通别名为空',
  `match_strength` VARCHAR(16) NOT NULL COMMENT '匹配强度：strong、weak、blocked',
  `release_status` VARCHAR(24) NOT NULL COMMENT '发布状态：draft、active、quarantined、retired',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_identity_alias` (`alias_type`, `normalized_alias`, `source_provider`),
  KEY `idx_identity_alias_owner` (`plant_identity_internal_id`),
  CONSTRAINT `ck_alias_release_status` CHECK (`release_status` IN ('draft', 'active', 'quarantined', 'retired')),
  CONSTRAINT `fk_identity_alias_owner` FOREIGN KEY (`plant_identity_internal_id`) REFERENCES `plant_identities` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 产品身份别名';

CREATE TABLE `plant_identity_alias_evidence` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '产品身份别名证据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `alias_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联产品身份别名',
  `source_name` VARCHAR(64) NOT NULL COMMENT '别名证据来源',
  `source_record_id` VARCHAR(160) NOT NULL COMMENT '来源记录稳定标识',
  `raw_artifact_ref` VARCHAR(512) NOT NULL COMMENT '受控原始证据制品引用',
  `raw_artifact_sha256` CHAR(64) NOT NULL COMMENT '原始证据 SHA-256',
  `ambiguity_group_key` CHAR(64) NULL COMMENT '同名歧义组摘要；无歧义为空',
  `review_decision` VARCHAR(24) NOT NULL COMMENT '裁决：allow、weak_only、block',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_alias_evidence` (`alias_internal_id`, `raw_artifact_sha256`),
  CONSTRAINT `ck_alias_evidence_decision` CHECK (`review_decision` IN ('allow', 'weak_only', 'block')),
  CONSTRAINT `fk_alias_evidence_owner` FOREIGN KEY (`alias_internal_id`) REFERENCES `plant_identity_aliases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 产品身份别名来源与歧义裁决';

CREATE TABLE `plant_identity_evidence` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '身份证据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `plant_identity_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联产品植物身份',
  `evidence_type` VARCHAR(32) NOT NULL COMMENT '证据类型：authority、crosscheck、cultivar_registry',
  `source_name` VARCHAR(64) NOT NULL COMMENT '证据来源名称',
  `source_record_id` VARCHAR(160) NOT NULL COMMENT '来源记录稳定标识',
  `source_version` VARCHAR(128) NOT NULL COMMENT '来源版本',
  `raw_artifact_ref` VARCHAR(512) NOT NULL COMMENT '受控原始证据制品引用',
  `evidence_hash` CHAR(64) NOT NULL COMMENT '证据制品 SHA-256',
  `retrieved_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '证据获取时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_identity_evidence` (`plant_identity_internal_id`, `source_name`, `source_record_id`, `evidence_hash`),
  CONSTRAINT `fk_identity_evidence_owner` FOREIGN KEY (`plant_identity_internal_id`) REFERENCES `plant_identities` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 植物身份权威证据';

CREATE TABLE `plant_identity_reviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '身份审核内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `plant_identity_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联产品植物身份',
  `review_ref` VARCHAR(64) NOT NULL COMMENT '高熵审核公开引用',
  `decision` VARCHAR(24) NOT NULL COMMENT '处置：REUSE_AS_IS、TRANSFORM、MERGE、SPLIT、REBUILD、REJECT、QUARANTINE',
  `decision_reason` TEXT NOT NULL COMMENT '中文审核依据',
  `reviewer_ref` VARCHAR(64) NOT NULL COMMENT '受控审核主体引用',
  `reviewed_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '审核时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_identity_review_ref` (`review_ref`),
  KEY `idx_identity_review_owner` (`plant_identity_internal_id`, `reviewed_at_ms`),
  CONSTRAINT `fk_identity_review_owner` FOREIGN KEY (`plant_identity_internal_id`) REFERENCES `plant_identities` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 植物身份人工审核';

CREATE TABLE `plant_identity_candidates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '识别候选内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `candidate_ref` VARCHAR(64) NOT NULL COMMENT '高熵候选公开引用',
  `provider` VARCHAR(32) NOT NULL COMMENT '候选提供方，例如 baidu',
  `provider_result_hash` CHAR(64) NOT NULL COMMENT '脱敏供应商结果 SHA-256',
  `matched_identity_internal_id` BIGINT UNSIGNED NULL COMMENT '映射到的已发布产品身份',
  `candidate_name` VARCHAR(255) NOT NULL COMMENT '供应商候选名称快照',
  `confidence_band` VARCHAR(16) NOT NULL COMMENT '置信区间：low、medium、high',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：pending、mapped、quarantined、rejected',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_identity_candidate_ref` (`candidate_ref`),
  KEY `idx_identity_candidate_lookup` (`provider`, `provider_result_hash`, `status`),
  CONSTRAINT `fk_candidate_identity` FOREIGN KEY (`matched_identity_internal_id`) REFERENCES `plant_identities` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 植物识别候选';

CREATE TABLE `plant_encyclopedia_revisions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '植物百科修订内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `revision_ref` VARCHAR(64) NOT NULL COMMENT '高熵修订公开引用',
  `plant_identity_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联产品植物身份',
  `structure_version` VARCHAR(32) NOT NULL COMMENT '展示百科结构版本',
  `display_content_json` JSON NOT NULL COMMENT '仅含展示介绍和简短问答',
  `source_kind` VARCHAR(24) NOT NULL COMMENT '来源：manual、qwen_draft、cms',
  `content_hash` CHAR(64) NOT NULL COMMENT '规范化展示内容 SHA-256',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：draft、review_pending、approved、rejected',
  `contributor_user_internal_id` BIGINT UNSIGNED NULL COMMENT '合格登录贡献用户，游客为空',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_encyclopedia_revision_ref` (`revision_ref`),
  UNIQUE KEY `uq_encyclopedia_content` (`plant_identity_internal_id`, `structure_version`, `content_hash`),
  CONSTRAINT `fk_encyclopedia_identity` FOREIGN KEY (`plant_identity_internal_id`) REFERENCES `plant_identities` (`id`),
  CONSTRAINT `fk_encyclopedia_contributor` FOREIGN KEY (`contributor_user_internal_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 展示型植物百科修订';

CREATE TABLE `plant_knowledge_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '植物知识发布内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `release_ref` VARCHAR(64) NOT NULL COMMENT '高熵不可变发布引用',
  `release_kind` VARCHAR(32) NOT NULL COMMENT '发布类型：taxonomy、identity、encyclopedia、internal_knowledge',
  `schema_version` VARCHAR(32) NOT NULL COMMENT '发布结构版本',
  `artifact_ref` VARCHAR(512) NOT NULL COMMENT '不可变发布制品引用',
  `artifact_hash` CHAR(64) NOT NULL COMMENT '发布制品 SHA-256',
  `record_count` INT UNSIGNED NOT NULL COMMENT '发布记录数量',
  `released_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '发布时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_knowledge_release_ref` (`release_ref`),
  UNIQUE KEY `uq_knowledge_release_hash` (`release_kind`, `artifact_hash`),
  CONSTRAINT `ck_knowledge_release_kind` CHECK (`release_kind` IN ('taxonomy', 'identity', 'encyclopedia', 'internal_knowledge'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 植物知识不可变发布';

CREATE TABLE `plant_knowledge_release_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '植物知识发布明细内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `release_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属不可变植物知识发布',
  `subject_kind` VARCHAR(24) NOT NULL COMMENT '对象类型：taxon、identity、alias、encyclopedia、internal_knowledge',
  `subject_ref` VARCHAR(64) NOT NULL COMMENT '发布对象高熵引用',
  `evidence_manifest_sha256` CHAR(64) NOT NULL COMMENT '对象证据清单 SHA-256',
  `decision_ref` VARCHAR(64) NOT NULL COMMENT '准入审核裁决引用',
  `admission_status` VARCHAR(24) NOT NULL COMMENT '写入不可变发布时必须为 ACTIVE 的准入状态快照',
  `release_item_sha256` CHAR(64) NOT NULL COMMENT '规范化发布明细 SHA-256',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_knowledge_release_item` (`release_internal_id`, `subject_kind`, `subject_ref`),
  CONSTRAINT `ck_knowledge_release_subject_kind` CHECK (`subject_kind` IN ('taxon', 'identity', 'alias', 'encyclopedia', 'internal_knowledge')),
  CONSTRAINT `ck_knowledge_release_item_admission_status` CHECK (`admission_status` = 'ACTIVE'),
  CONSTRAINT `fk_knowledge_release_item_owner` FOREIGN KEY (`release_internal_id`) REFERENCES `plant_knowledge_releases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 植物知识发布逐项准入清单';

CREATE TABLE `active_plant_knowledge_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '当前生效植物知识发布指针内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `release_kind` VARCHAR(32) NOT NULL COMMENT '发布类型：taxonomy、identity、encyclopedia、internal_knowledge',
  `release_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '当前生效不可变发布内部主键',
  `active_release_version` VARCHAR(64) NOT NULL COMMENT '当前生效发布版本',
  `active_artifact_sha256` CHAR(64) NOT NULL COMMENT '当前生效发布制品 SHA-256',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '原子切换乐观并发版本',
  `activated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '激活时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_active_knowledge_release` (`release_kind`),
  CONSTRAINT `ck_active_knowledge_release_kind` CHECK (`release_kind` IN ('taxonomy', 'identity', 'encyclopedia', 'internal_knowledge')),
  CONSTRAINT `fk_active_knowledge_release` FOREIGN KEY (`release_internal_id`) REFERENCES `plant_knowledge_releases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 当前生效植物知识发布指针';

CREATE TABLE `knowledge_gap_aggregates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '知识缺口聚合内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `gap_key` CHAR(64) NOT NULL COMMENT '规范化缺口主题摘要',
  `provider` VARCHAR(32) NOT NULL COMMENT '识别来源',
  `normalized_candidate_name` VARCHAR(255) NOT NULL COMMENT '规范化候选名称',
  `occurrence_count` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '聚合触发次数',
  `first_seen_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '首次发现时间，UTC 毫秒',
  `last_seen_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '最近发现时间，UTC 毫秒',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：aggregating、queued、resolved、blocked',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_knowledge_gap_key` (`gap_key`),
  KEY `idx_knowledge_gap_queue` (`status`, `last_seen_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 植物知识缺口聚合';

CREATE TABLE `knowledge_enrichment_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '百科补缺任务内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `job_ref` VARCHAR(64) NOT NULL COMMENT '高熵补缺任务公开引用',
  `gap_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '关联知识缺口聚合',
  `contributor_user_internal_id` BIGINT UNSIGNED NULL COMMENT '触发补缺的登录用户，游客为空',
  `status` VARCHAR(24) NOT NULL COMMENT '任务状态：queued、leased、generating、validating、draft_ready、failed',
  `lease_owner` VARCHAR(64) NULL COMMENT '当前租约执行者',
  `lease_until_ms` BIGINT UNSIGNED NULL COMMENT '租约失效时间，UTC 毫秒',
  `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '执行尝试次数',
  `prompt_hash` CHAR(64) NOT NULL COMMENT '受控提示词 SHA-256',
  `model_contract_version` VARCHAR(64) NOT NULL COMMENT '模型输出合同版本',
  `failure_code` VARCHAR(64) NULL COMMENT '脱敏失败代码',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enrichment_job_ref` (`job_ref`),
  UNIQUE KEY `uq_enrichment_gap_active` (`gap_internal_id`, `model_contract_version`),
  KEY `idx_enrichment_lease` (`status`, `lease_until_ms`),
  CONSTRAINT `fk_enrichment_gap` FOREIGN KEY (`gap_internal_id`) REFERENCES `knowledge_gap_aggregates` (`id`),
  CONSTRAINT `fk_enrichment_contributor` FOREIGN KEY (`contributor_user_internal_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 CMS 展示百科补缺任务';

CREATE TABLE `cms_review_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'CMS 审核项内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `review_item_ref` VARCHAR(64) NOT NULL COMMENT '高熵 CMS 审核项引用',
  `subject_type` VARCHAR(32) NOT NULL COMMENT '审核主题类型',
  `subject_ref` VARCHAR(64) NOT NULL COMMENT '审核主题公开引用',
  `draft_revision_internal_id` BIGINT UNSIGNED NULL COMMENT '展示百科草稿修订内部主键',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：review_pending、approved、rejected',
  `reviewer_ref` VARCHAR(64) NULL COMMENT '受控审核主体引用',
  `review_note` TEXT NULL COMMENT '中文审核说明',
  `reviewed_at_ms` BIGINT UNSIGNED NULL COMMENT '审核时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cms_review_ref` (`review_item_ref`),
  KEY `idx_cms_review_queue` (`status`, `created_at_ms`),
  CONSTRAINT `fk_cms_review_revision` FOREIGN KEY (`draft_revision_internal_id`) REFERENCES `plant_encyclopedia_revisions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 CMS 人工审核队列';

CREATE TABLE `cms_contribution_reward_decisions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '贡献奖励裁决内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `decision_ref` VARCHAR(64) NOT NULL COMMENT '高熵奖励裁决引用',
  `reward_type` VARCHAR(24) NOT NULL COMMENT '奖励类型：CMS_IDENTITY、CMS_CONTENT',
  `reward_subject_key` VARCHAR(191) NOT NULL COMMENT '全局唯一奖励主题键',
  `contributor_user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '首位合格贡献用户',
  `contribution_ref` VARCHAR(64) NOT NULL COMMENT '合格贡献公开引用',
  `release_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '实际发布版本内部主键',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：eligible、granted、reversed',
  `reward_event_id` VARCHAR(64) NULL COMMENT '发出的奖励事件引用',
  `reversal_ref` VARCHAR(64) NULL COMMENT '冲正引用',
  `eligible_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '满足奖励资格时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cms_reward_decision_ref` (`decision_ref`),
  UNIQUE KEY `uq_cms_reward_subject` (`reward_type`, `reward_subject_key`),
  KEY `idx_cms_reward_contributor` (`contributor_user_internal_id`, `eligible_at_ms`),
  CONSTRAINT `fk_cms_reward_user` FOREIGN KEY (`contributor_user_internal_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_cms_reward_release` FOREIGN KEY (`release_internal_id`) REFERENCES `plant_knowledge_releases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 CMS 首发贡献奖励裁决';

CREATE TABLE `content_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '通用内容发布内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `release_ref` VARCHAR(64) NOT NULL COMMENT '高熵不可变内容发布引用',
  `content_kind` VARCHAR(32) NOT NULL COMMENT '内容类型：question_package、care_rule、diagnosis_rule、prompt',
  `content_key` VARCHAR(128) NOT NULL COMMENT '内容稳定业务键',
  `schema_version` VARCHAR(32) NOT NULL COMMENT '内容结构版本',
  `payload_json` JSON NOT NULL COMMENT '已校验的不可变发布内容',
  `payload_hash` CHAR(64) NOT NULL COMMENT '发布内容 SHA-256',
  `released_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '发布时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_content_release_ref` (`release_ref`),
  UNIQUE KEY `uq_content_release_hash` (`content_kind`, `content_key`, `payload_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 通用不可变内容发布';

CREATE TABLE `active_content_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '活动内容指针内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `content_kind` VARCHAR(32) NOT NULL COMMENT '内容类型',
  `content_key` VARCHAR(128) NOT NULL COMMENT '内容稳定业务键',
  `content_release_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '当前活动不可变发布版本',
  `activated_by_ref` VARCHAR(64) NOT NULL COMMENT '受控发布主体引用',
  `activated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '生效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_active_content_pointer` (`content_kind`, `content_key`),
  CONSTRAINT `fk_active_content_release` FOREIGN KEY (`content_release_internal_id`) REFERENCES `content_releases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 活动内容发布指针';
