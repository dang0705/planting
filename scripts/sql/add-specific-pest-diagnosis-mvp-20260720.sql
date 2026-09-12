-- Idempotent artifact for the specific-pest visual MVP.
-- Do not execute automatically. This only backfills formal symptoms used by
-- the visual prompt, admission pool, and diagnosis-mode router.
-- No symptom_problem_evidence rows are required: specific pest routing uses
-- admitted visual evidence plus the dynamic specific_pest_visual question
-- package resolver, not problem-edge scoring.

INSERT INTO `symptoms` (
  `symptom_key`,
  `symptom_cn`,
  `location_key`,
  `pattern_key`,
  `distribution_key`,
  `symptom_type`,
  `signal_reliability`,
  `ai_visual_pool`,
  `display_text_cn`,
  `user_observation_tip_cn`,
  `confusion_note_cn`,
  `data_status`
) VALUES
  ('visible_mite_colony', '叶背可见叶螨虫体', 'leaf', 'visible_pest_body', 'local', 'visual', 0.92, JSON_QUOTE('yes'), '叶背或叶柄附近可见很小的点状虫体。', '重点查看叶背、叶柄交界处。', '不要仅凭整片发黄判断叶螨。', 'audited'),
  ('fine_webbing', '细密蛛网状丝线', 'leaf', 'webbing', 'local', 'visual', 0.9, JSON_QUOTE('yes'), '叶背或叶柄附近可见细密蛛网状丝线。', '放大查看叶背和叶柄夹角。', '普通灰尘或绒毛不等于蛛网。', 'audited'),
  ('yellow_speckling', '点刺状黄白小点', 'leaf', 'speckling', 'local', 'visual', 0.78, JSON_QUOTE('yes'), '叶面可见密集黄白小点或点刺状失绿。', '仅作为叶螨或蓟马支持线索。', '不得当作普通黄叶模式的直接证据。', 'audited'),
  ('visible_mealybug_colony', '白色棉絮状虫团', 'stem', 'cottony_cluster', 'local', 'visual', 0.93, JSON_QUOTE('yes'), '叶腋、茎节或叶柄处可见白色棉絮状虫团。', '优先查看叶腋和茎节缝隙。', '白色水渍、肥料残留不等于虫团。', 'audited'),
  ('scale_shells', '固定壳状虫体', 'stem', 'fixed_shells', 'local', 'visual', 0.92, JSON_QUOTE('yes'), '茎或叶背可见固定不动的小壳状凸起。', '轻看茎表面和叶背主脉附近。', '木栓化斑点不等于介壳虫。', 'audited'),
  ('white_flies', '白色小飞虫', 'leaf', 'flying_white_insects', 'local', 'visual', 0.86, JSON_QUOTE('yes'), '叶背附近可见白色小飞虫或被轻碰后飞起。', '安全前提下轻碰叶片观察。', '漂浮灰尘不等于白粉虱。', 'audited'),
  ('fixed_oval_nymphs', '固定椭圆若虫', 'leaf', 'fixed_oval_nymphs', 'local', 'visual', 0.82, JSON_QUOTE('yes'), '叶背可见固定的小白点或椭圆虫体。', '检查叶背密集小白点。', '水渍或粉尘不等于固定若虫。', 'audited'),
  ('aphids_visible', '嫩梢成群小软虫', 'leaf', 'clustered_soft_insects', 'local', 'visual', 0.91, JSON_QUOTE('yes'), '嫩梢、新叶或花苞附近可见成群小软虫。', '优先查看新芽和花苞附近。', '嫩芽纹理不等于虫体。', 'audited'),
  ('thrips_visible', '细长小虫可见', 'leaf', 'slender_insects', 'local', 'visual', 0.86, JSON_QUOTE('yes'), '叶面或花部附近可见细长小虫。', '查看银灰擦痕附近是否有细长虫体。', '叶片纤维不等于蓟马。', 'audited'),
  ('silver_scarring', '银灰擦痕', 'leaf', 'silvery_scarring', 'local', 'visual', 0.8, JSON_QUOTE('yes'), '叶面可见发白、发灰，像被擦过的条斑。', '结合黑点或虫体一起判断。', '机械刮伤也可能形成类似痕迹。', 'audited'),
  ('black_fecal_spots', '细小黑点', 'leaf', 'tiny_black_spots', 'local', 'visual', 0.76, JSON_QUOTE('yes'), '银灰条斑附近可见细小黑点。', '和银灰擦痕一起观察。', '土粒或灰尘不等于虫粪。', 'audited'),
  ('tunnels_in_leaf', '叶内潜道', 'leaf', 'serpentine_tunnel', 'local', 'visual', 0.91, JSON_QUOTE('yes'), '叶片内部可见弯弯绕绕的浅色线条或块状潜道。', '观察线条是否在叶片组织内部。', '表面划痕不等于潜叶虫。', 'audited'),
  ('small_flies_soil', '盆土小黑飞', 'soil', 'small_soil_flies', 'local', 'visual', 0.88, JSON_QUOTE('yes'), '盆土表面或盆边可见小黑飞活动。', '观察小飞虫是否主要围绕盆土。', '偶发飞虫不等于蕈蚊。', 'audited'),
  ('wet_soil_surface', '表土长期偏湿', 'soil', 'wet_surface', 'organ', 'visual', 0.7, JSON_QUOTE('yes'), '盆土表面看起来长期偏湿或发暗。', '结合盆土小飞虫判断。', '刚浇水后的短时潮湿不能单独判断。', 'audited'),
  ('surface_glossy_residue', '表面发亮透明残留', 'leaf', 'glossy_residue', 'local', 'visual', 0.74, JSON_QUOTE('yes'), '叶片或枝条表面可见发亮、近透明的滴状或薄膜状残留。', '只记录可见发亮透明残留，不判断触感。', '视觉层不得推断触感或分泌物来源。', 'audited'),
  ('sooty_mold', '黑灰膜状覆盖', 'leaf', 'black_film', 'local', 'visual', 0.78, JSON_QUOTE('yes'), '叶面可见像蒙了一层黑灰或黑膜。', '结合虫体或表面残留判断。', '普通灰尘不等于黑霉层。', 'audited')
ON DUPLICATE KEY UPDATE
  `symptom_cn` = VALUES(`symptom_cn`),
  `location_key` = VALUES(`location_key`),
  `pattern_key` = VALUES(`pattern_key`),
  `distribution_key` = VALUES(`distribution_key`),
  `symptom_type` = VALUES(`symptom_type`),
  `signal_reliability` = VALUES(`signal_reliability`),
  `ai_visual_pool` = JSON_QUOTE('yes'),
  `display_text_cn` = VALUES(`display_text_cn`),
  `user_observation_tip_cn` = VALUES(`user_observation_tip_cn`),
  `confusion_note_cn` = VALUES(`confusion_note_cn`),
  `data_status` = 'audited';

-- Promote the existing C-end leaf_droop row into the audited visual pool for
-- full-profile wilting_droop routing. Preserve existing display/user copy.
UPDATE `symptoms`
SET
  `symptom_type` = 'visual',
  `ai_visual_pool` = JSON_QUOTE('yes'),
  `data_status` = 'audited'
WHERE `symptom_key` = 'leaf_droop';
