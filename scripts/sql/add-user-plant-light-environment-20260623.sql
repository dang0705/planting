ALTER TABLE `cloud1_dev`.`user_plant_instances`
  ADD COLUMN `light_environment_json` JSON NULL COMMENT '用户填写的光照环境，结构与诊断 userLightContext 一致'
  AFTER `location`;
