-- 盆型信息按硬规定直接落用户植物主表 user_plant_instances，不再使用独立养护扩展表。
-- 主表加 6 列盆型字段 + profile 元数据；has_drainage_hole/pot_material/substrate_type 用 VARCHAR 承载，
-- substrate_type 允许 JSON 数组字符串（多选+比例）或单值。
ALTER TABLE `cloud1_dev`.`user_plant_instances`
  ADD COLUMN IF NOT EXISTS `pot_top_diameter_cm` DECIMAL(6,2) NULL COMMENT '盆口直径，单位 cm'
    AFTER `light_environment_json`,
  ADD COLUMN IF NOT EXISTS `pot_bottom_diameter_cm` DECIMAL(6,2) NULL COMMENT '盆底直径，单位 cm'
    AFTER `pot_top_diameter_cm`,
  ADD COLUMN IF NOT EXISTS `pot_height_cm` DECIMAL(6,2) NULL COMMENT '盆高，单位 cm'
    AFTER `pot_bottom_diameter_cm`,
  ADD COLUMN IF NOT EXISTS `has_drainage_hole` VARCHAR(16) NOT NULL DEFAULT 'true' COMMENT '是否有排水孔：true/false/unknown'
    AFTER `pot_height_cm`,
  ADD COLUMN IF NOT EXISTS `pot_material` VARCHAR(32) NOT NULL DEFAULT 'unknown' COMMENT '盆器材质：plastic/ceramic/terracotta/glazed/unknown'
    AFTER `has_drainage_hole`,
  ADD COLUMN IF NOT EXISTS `substrate_type` VARCHAR(2048) NOT NULL DEFAULT 'unknown' COMMENT '基质类型：允许 JSON 数组字符串（多选+比例）或单值'
    AFTER `pot_material`,
  ADD COLUMN IF NOT EXISTS `pot_profile_version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '盆型画像版本'
    AFTER `substrate_type`,
  ADD COLUMN IF NOT EXISTS `pot_profile_source` VARCHAR(32) NOT NULL DEFAULT 'default' COMMENT '盆型画像来源：user/default/inferred'
    AFTER `pot_profile_version`,
  ADD COLUMN IF NOT EXISTS `pot_profile_confidence` VARCHAR(16) NOT NULL DEFAULT 'low' COMMENT '盆型画像置信度：low/normal/high'
    AFTER `pot_profile_source`;

-- 盆型信息已完整迁入主表；若历史扩展表存在则废弃（研发未上线，无需迁移历史数据）。
DROP TABLE IF EXISTS `cloud1_dev`.`user_plant_care_extensions`;

/*
  watering_way_quantization_json 是 watering_strategy_json.way/freq 的量化扩展，
  不替代 watering_strategy_json 事实源。JSON contract 必须包含：
  - wayClass
  - depletionTrigger
  - targetMoistureMid
  - wetTolerance
  - dryTolerance
  - amountPolicy
  - nextActionClass
  - seasonalGate
*/
ALTER TABLE `cloud1_dev`.`genus_care_profiles`
  ADD COLUMN IF NOT EXISTS `watering_way_quantization_json` JSON NULL COMMENT '基于 watering_strategy_json.way/freq 的算法量化扩展，不替代事实源'
    AFTER `watering_strategy_json`,
  ADD COLUMN IF NOT EXISTS `watering_strategy_version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'watering_strategy_json 与量化扩展的 schema/审核版本'
    AFTER `watering_way_quantization_json`,
  ADD COLUMN IF NOT EXISTS `watering_strategy_review_status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '浇水策略量化审核状态'
    AFTER `watering_strategy_version`;

UPDATE `cloud1_dev`.`genus_care_profiles`
SET
  `watering_way_quantization_json` = JSON_OBJECT(
    'wayClass',
    CASE
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持水位|换水|水生' THEN 'water_level'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持.*(湿润|微湿)|均匀湿润|表土微干即浇' THEN 'evenly_moist'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '完全干透|干透|宁干勿湿|偏干' THEN 'dry_down'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '表层.?[0-9一二三2–-]+.?cm|表层土微干|表土微干|微干后浇透|见干浇透' THEN 'top_dry'
      ELSE 'needs_review'
    END,
    'depletionTrigger',
    CASE
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持水位|换水|水生' THEN 'maintain_water_level'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持.*(湿润|微湿)|均匀湿润|表土微干即浇' THEN 'keep_evenly_moist'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '完全干透|干透|宁干勿湿|偏干' THEN 'full_dry'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '表层.?[0-9一二三2–-]+.?cm' THEN 'top_2_3cm'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '表层土微干|表土微干|微干后浇透|见干浇透' THEN 'surface_dry'
      ELSE 'needs_review'
    END,
    'targetMoistureMid',
    CASE
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持水位|换水|水生' THEN 0.85
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持.*(湿润|微湿)|均匀湿润|表土微干即浇' THEN 0.65
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '完全干透|干透|宁干勿湿|偏干' THEN 0.28
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '表层.?[0-9一二三2–-]+.?cm|表层土微干|表土微干|微干后浇透|见干浇透' THEN 0.45
      ELSE 0.50
    END,
    'wetTolerance',
    CASE
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持水位|换水|水生' THEN 'high'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '忌积水|避免积水|完全干透|干透|宁干勿湿|偏干' THEN 'low'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持.*(湿润|微湿)|均匀湿润|表土微干即浇' THEN 'medium_high'
      ELSE 'normal'
    END,
    'dryTolerance',
    CASE
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持水位|换水|水生' THEN 'very_low'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持.*(湿润|微湿)|均匀湿润|表土微干即浇' THEN 'low'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '完全干透|干透|宁干勿湿|偏干' THEN 'high'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '表层.?[0-9一二三2–-]+.?cm|表层土微干|表土微干|微干后浇透|见干浇透' THEN 'normal'
      ELSE 'unknown'
    END,
    'amountPolicy',
    CASE
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持水位|换水|水生' THEN 'maintain_water_or_refresh'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '忌积水|避免积水' THEN 'controlled_soak_drain'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '浇透' THEN 'soak_then_drain'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持.*(湿润|微湿)|均匀湿润|表土微干即浇' THEN 'small_frequent'
      ELSE 'baseline_by_freq'
    END,
    'nextActionClass',
    CASE
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持水位|换水|水生' THEN 'maintain_water_level'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持.*(湿润|微湿)|均匀湿润|表土微干即浇' THEN 'water_before_dry'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '完全干透|干透|宁干勿湿|偏干' THEN 'wait_until_trigger'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '表层.?[0-9一二三2–-]+.?cm|表层土微干|表土微干|微干后浇透|见干浇透' THEN 'check_topsoil_then_water'
      ELSE 'manual_review'
    END,
    'seasonalGate',
    JSON_OBJECT(
      'type',
      'baseline_interval',
      'freqDays',
      JSON_EXTRACT(`watering_strategy_json`, '$.freq'),
      'source',
      'watering_strategy_json.freq'
    )
  ),
  `watering_strategy_review_status` = CASE
    WHEN JSON_UNQUOTE(JSON_EXTRACT(`watering_strategy_json`, '$.way')) REGEXP '保持水位|换水|水生|保持.*(湿润|微湿)|均匀湿润|表土微干即浇|完全干透|干透|宁干勿湿|偏干|表层.?[0-9一二三2–-]+.?cm|表层土微干|表土微干|微干后浇透|见干浇透' THEN 'machine_quantized'
    ELSE 'needs_review'
  END
WHERE `watering_way_quantization_json` IS NULL;
