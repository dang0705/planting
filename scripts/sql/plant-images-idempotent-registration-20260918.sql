-- plant_images 登记幂等性：同一用户的同一个云文件只允许一条记录。
-- 执行前必须先确认无重复 fileId；已有行不做改写或删除。
ALTER TABLE `cloud1-2grufevs395a9d5e`.`plant_images`
  ADD UNIQUE KEY `uk_plant_images_owner_file` (`_openid`, `fileId`);
