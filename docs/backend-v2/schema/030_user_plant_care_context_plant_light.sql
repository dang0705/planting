-- 030：用户植物养护环境增加“植物位置最近一次 Lux 实测”（user-plant-environment-profile/v1 plantLight，用户 2026-10-10 裁决 Lux 存档）。
-- 在 003 建表后执行；只新增三个可空列与一条三列同空/同不空的检查约束，不改既有列、不搬迁记录（既有行三列均为 NULL，即“未测”）。
-- 有效期不入库：读取方按浇水策略 luxAnchorMaxAgeDays 判定。切换条件：information_schema.COLUMNS 读回三列且 CHECK_CONSTRAINTS 读回约束；
-- 回退：停止新版 user-plant 写入 plantLight 后，由 DBA 另行批准删除约束与三列（不在本文件中）。只写文件：由人工在获批窗口执行，不在 HTTP 函数启动时执行。
ALTER TABLE `user_plant_care_contexts`
  ADD COLUMN `plant_light_lux` DOUBLE NULL COMMENT '植物位置最近一次实测照度（Lux，非负）',
  ADD COLUMN `plant_light_measured_at_ms` BIGINT UNSIGNED NULL COMMENT '该次照度测量时间，UTC 毫秒',
  ADD COLUMN `plant_light_source` VARCHAR(32) NULL COMMENT '照度来源：meter 照度计或 camera_estimate 相机估算',
  ADD CONSTRAINT `ck_user_plant_care_context_plant_light` CHECK (
    (`plant_light_lux` IS NULL AND `plant_light_measured_at_ms` IS NULL AND `plant_light_source` IS NULL)
    OR (`plant_light_lux` IS NOT NULL AND `plant_light_lux` >= 0 AND `plant_light_measured_at_ms` IS NOT NULL
      AND `plant_light_source` IN ('meter', 'camera_estimate'))
  );
