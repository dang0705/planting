ALTER TABLE `cloud1_dev`.`symptom_classes`
CHANGE COLUMN `followup_enabled_v1` `question_enabled_v1` TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE `cloud1_dev`.`symptom_classes`
CHANGE COLUMN `followup_mode_v1` `question_mode_v1` VARCHAR(64) NOT NULL DEFAULT 'disabled';

ALTER TABLE `cloud1_dev`.`symptom_classes`
CHANGE COLUMN `runtime_gate_rule` `runtime_condition_rule` VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE `cloud1_dev`.`symptom_class_mapping`
CHANGE COLUMN `followup_enabled_v1` `question_enabled_v1` TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE `cloud1_dev`.`symptom_class_mapping`
CHANGE COLUMN `followup_mode_v1` `question_mode_v1` VARCHAR(64) NOT NULL DEFAULT 'disabled';

ALTER TABLE `cloud1_dev`.`class_question_group_strategy`
CHANGE COLUMN `followup_mode_v1` `question_mode_v1` VARCHAR(64) NOT NULL DEFAULT 'disabled';

ALTER TABLE `cloud1_dev`.`class_question_group_strategy`
CHANGE COLUMN `class_gate_type` `class_condition_type` VARCHAR(64) NOT NULL DEFAULT 'soft';
