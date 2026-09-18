ALTER TABLE `cloud1_dev`.`diagnosis_outcomes`
CHANGE COLUMN `legacy_problem_key` `problem_key` VARCHAR(128) NOT NULL DEFAULT '';
