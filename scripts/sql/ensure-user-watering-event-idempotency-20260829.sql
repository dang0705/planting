-- 浇水完成事件幂等迁移。
-- 幂等范围必须包含 plan_id；同一天的不同浇水事件不能被日期粗暴合并。
ALTER TABLE `user_watering_events`
  MODIFY COLUMN `plan_id` VARCHAR(128) NULL COMMENT '关联的 planner 建议 ID';

ALTER TABLE `user_watering_events`
  DROP INDEX `uq_user_plant_watering_event`,
  ADD UNIQUE KEY `uq_user_plant_watering_event`
    (`_openid`, `user_plant_id`, `event_date`, `source`, `plan_id`);
