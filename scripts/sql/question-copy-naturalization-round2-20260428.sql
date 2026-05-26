-- Round 2: naturalize follow-up question text.
-- Keep option keys, mappings, scoring semantics, and first-round yes/no answer convergence unchanged.

UPDATE `question_library_v5_real`
SET
  `question_text_cn` = CASE `question_key`
    WHEN 'q_anthracnose_concentric' THEN '病斑里能看到一圈一圈的纹路吗？'
    WHEN 'q_anthracnose_sunken' THEN '病斑摸起来或看起来有下陷吗？'
    WHEN 'q_bacterial_water_soaked' THEN '病斑是不是像被水浸过，发暗、半透明或偏湿？'
    WHEN 'q_bud_drop_low_humidity_damage' THEN '掉苞前，环境是否偏干、靠近风口，或叶尖也容易发干？'
    WHEN 'q_underwater_dry_wilt' THEN '盆土干透时，叶子会明显发蔫吗？'
    WHEN 'q_chewed_edges_confirm' THEN '叶子边缘看起来是真的缺了一块吗？'
    WHEN 'q_edema_blisters' THEN '叶背有没有像小水泡一样鼓起来的点？'
    WHEN 'q_edema_warty' THEN '这些鼓包后来会变粗糙，像锈色小疙瘩吗？'
    WHEN 'q_flower_abort_low_humidity_damage' THEN '花发育失败前，是否有空气很干、温差大，或浇水忽多忽少？'
    WHEN 'q_gnat_small_flies' THEN '盆土表面或花盆周围，有像小蚊子一样的小飞虫吗？'
    WHEN 'q_gray_mold_white_fuzz' THEN '这些霉层是不是一开始偏白，后来逐渐变灰？'
    WHEN 'q_holes_in_leaf_confirm' THEN '这些位置是不是真的破了洞或缺了一块？'
    WHEN 'q_sticky_honeydew_confirm' THEN '叶面、叶柄或花盆周围摸起来有明显黏感吗？'
    WHEN 'q_sooty_mold_confirm' THEN '叶片表面有一层黑灰色、像灰尘或煤灰一样的脏层吗？'
    WHEN 'q_iron_new_leaves_yellow' THEN '发黄主要出现在新叶，还是老叶更明显？'
    WHEN 'q_iron_not_old_first' THEN '新叶明显更黄，而老叶相对还比较绿吗？'
    WHEN 'q_leaf_margin_necrosis_confirm' THEN '叶子边缘有没有形成一圈连续的褐色或黑色干枯边？'
    WHEN 'q_leaf_margin_necrosis_v_shaped_lesions' THEN '干枯边内侧有没有发黄的边，或像 V 字形一样往叶片里面扩展？'
    WHEN 'q_leaf_mosaic_mottling_confirm' THEN '叶片上有没有深浅不一、像拼块一样的花纹？'
    WHEN 'q_brown_spots_halo_confirm' THEN '褐色斑点周围，有没有一圈发黄的边？'
    WHEN 'q_black_spots_surface_layer_check' THEN '这些黑斑更像长在叶子里面，还是像浮在表面的脏层？'
    WHEN 'q_leaf_yellowing_confirm' THEN '叶片有没有明显发黄？'
    WHEN 'q_nitrogen_old_leaves_yellow' THEN '发黄主要先从老叶、下部叶片开始吗？'
    WHEN 'q_nitrogen_uniform_yellow' THEN '老叶是不是整片比较均匀地变黄？'
    WHEN 'q_root_rot_bad_smell' THEN '根部或根团有明显烂味、臭味吗？'
    WHEN 'q_root_rot_black_roots' THEN '根系有没有明显发黑？'
    WHEN 'q_root_rot_mushy_roots' THEN '根系是否发软、发糊，轻轻一碰就断？'
    WHEN 'q_root_rot_wet_soil_wilt' THEN '盆土还湿着时，叶子仍然发蔫吗？'
    WHEN 'q_rust_pustules_visible' THEN '叶面或叶背有橙黄、锈褐色、会掉粉的小点吗？'
    WHEN 'q_rust_orange_spots' THEN '叶片正面先出现黄橙色斑点，背面又出现会掉粉的小点吗？'
    WHEN 'q_skeletonized_leaves_confirm' THEN '叶片中间的叶肉是不是被破坏，留下比较完整的叶脉，像网一样？'
    WHEN 'q_spider_webbing_visible' THEN '叶片、叶柄或枝叶连接处，能看到很细的网状丝吗？'
    WHEN 'q_stem_collapse_confirm' THEN '茎是否弯折、塌陷，或整段撑不住？'
    WHEN 'q_tunnels_in_leaf_confirm' THEN '叶片里面能看到弯弯曲曲的浅白色线条吗？'
    WHEN 'q_uniform_browning_crispy_edges' THEN '变褐的叶片边缘会发干、发脆、卷起来吗？'
    WHEN 'q_water_soaked_stem_confirm' THEN '茎部有半透明、发暗，像被水泡过的区域吗？'
    WHEN 'q_wind_damage_crispy_edges' THEN '受损叶边是否发干、发脆，像长期被风吹干？'
    WHEN 'q_leaf_yellowing_fertilization_background' THEN '最近 1 个月左右，施肥情况更接近哪一种？'
    WHEN 'q_yellowing_patchy_yellow_speckling' THEN '发黄区域里还能看到很多细小的黄点或褪色点吗？'
    WHEN 'q_irregular_blotches_confirm' THEN '病斑的形状是不是不规则的一片或一块？'
    WHEN 'q_patchy_browning_confirm' THEN '叶片是不是只有局部一块块变褐？'
    WHEN 'q_stable_marking_new_growth_consistent' THEN '新长出来的叶子也有类似花纹吗？'
    WHEN 'q_stable_marking_pattern_confirm' THEN '这些斑驳或条纹看起来像一直稳定存在的固有花纹吗？'
    WHEN 'q_uniform_browning_confirm' THEN '是不是整片叶子几乎一起变褐？'
    WHEN 'q_yellowing_patchy_confirm' THEN '叶片是不是局部一块块发黄？'
    ELSE `question_text_cn`
  END,
  `question_text_user_cn` = CASE `question_key`
    WHEN 'q_anthracnose_concentric' THEN '病斑里能看到一圈一圈的纹路吗？'
    WHEN 'q_anthracnose_sunken' THEN '病斑摸起来或看起来有下陷吗？'
    WHEN 'q_bacterial_water_soaked' THEN '病斑是不是像被水浸过，发暗、半透明或偏湿？'
    WHEN 'q_bud_drop_low_humidity_damage' THEN '掉苞前，环境是否偏干、靠近风口，或叶尖也容易发干？'
    WHEN 'q_underwater_dry_wilt' THEN '盆土干透时，叶子会明显发蔫吗？'
    WHEN 'q_chewed_edges_confirm' THEN '叶子边缘看起来是真的缺了一块吗？'
    WHEN 'q_edema_blisters' THEN '叶背有没有像小水泡一样鼓起来的点？'
    WHEN 'q_edema_warty' THEN '这些鼓包后来会变粗糙，像锈色小疙瘩吗？'
    WHEN 'q_flower_abort_low_humidity_damage' THEN '花发育失败前，是否有空气很干、温差大，或浇水忽多忽少？'
    WHEN 'q_gnat_small_flies' THEN '盆土表面或花盆周围，有像小蚊子一样的小飞虫吗？'
    WHEN 'q_gray_mold_white_fuzz' THEN '这些霉层是不是一开始偏白，后来逐渐变灰？'
    WHEN 'q_holes_in_leaf_confirm' THEN '这些位置是不是真的破了洞或缺了一块？'
    WHEN 'q_sticky_honeydew_confirm' THEN '叶面、叶柄或花盆周围摸起来有明显黏感吗？'
    WHEN 'q_sooty_mold_confirm' THEN '叶片表面有一层黑灰色、像灰尘或煤灰一样的脏层吗？'
    WHEN 'q_iron_new_leaves_yellow' THEN '发黄主要出现在新叶，还是老叶更明显？'
    WHEN 'q_iron_not_old_first' THEN '新叶明显更黄，而老叶相对还比较绿吗？'
    WHEN 'q_leaf_margin_necrosis_confirm' THEN '叶子边缘有没有形成一圈连续的褐色或黑色干枯边？'
    WHEN 'q_leaf_margin_necrosis_v_shaped_lesions' THEN '干枯边内侧有没有发黄的边，或像 V 字形一样往叶片里面扩展？'
    WHEN 'q_leaf_mosaic_mottling_confirm' THEN '叶片上有没有深浅不一、像拼块一样的花纹？'
    WHEN 'q_brown_spots_halo_confirm' THEN '褐色斑点周围，有没有一圈发黄的边？'
    WHEN 'q_black_spots_surface_layer_check' THEN '这些黑斑更像长在叶子里面，还是像浮在表面的脏层？'
    WHEN 'q_leaf_yellowing_confirm' THEN '叶片有没有明显发黄？'
    WHEN 'q_nitrogen_old_leaves_yellow' THEN '发黄主要先从老叶、下部叶片开始吗？'
    WHEN 'q_nitrogen_uniform_yellow' THEN '老叶是不是整片比较均匀地变黄？'
    WHEN 'q_root_rot_bad_smell' THEN '根部或根团有明显烂味、臭味吗？'
    WHEN 'q_root_rot_black_roots' THEN '根系有没有明显发黑？'
    WHEN 'q_root_rot_mushy_roots' THEN '根系是否发软、发糊，轻轻一碰就断？'
    WHEN 'q_root_rot_wet_soil_wilt' THEN '盆土还湿着时，叶子仍然发蔫吗？'
    WHEN 'q_rust_pustules_visible' THEN '叶面或叶背有橙黄、锈褐色、会掉粉的小点吗？'
    WHEN 'q_rust_orange_spots' THEN '叶片正面先出现黄橙色斑点，背面又出现会掉粉的小点吗？'
    WHEN 'q_skeletonized_leaves_confirm' THEN '叶片中间的叶肉是不是被破坏，留下比较完整的叶脉，像网一样？'
    WHEN 'q_spider_webbing_visible' THEN '叶片、叶柄或枝叶连接处，能看到很细的网状丝吗？'
    WHEN 'q_stem_collapse_confirm' THEN '茎是否弯折、塌陷，或整段撑不住？'
    WHEN 'q_tunnels_in_leaf_confirm' THEN '叶片里面能看到弯弯曲曲的浅白色线条吗？'
    WHEN 'q_uniform_browning_crispy_edges' THEN '变褐的叶片边缘会发干、发脆、卷起来吗？'
    WHEN 'q_water_soaked_stem_confirm' THEN '茎部有半透明、发暗，像被水泡过的区域吗？'
    WHEN 'q_wind_damage_crispy_edges' THEN '受损叶边是否发干、发脆，像长期被风吹干？'
    WHEN 'q_leaf_yellowing_fertilization_background' THEN '最近 1 个月左右，施肥情况更接近哪一种？'
    WHEN 'q_yellowing_patchy_yellow_speckling' THEN '发黄区域里还能看到很多细小的黄点或褪色点吗？'
    WHEN 'q_irregular_blotches_confirm' THEN '病斑的形状是不是不规则的一片或一块？'
    WHEN 'q_patchy_browning_confirm' THEN '叶片是不是只有局部一块块变褐？'
    WHEN 'q_stable_marking_new_growth_consistent' THEN '新长出来的叶子也有类似花纹吗？'
    WHEN 'q_stable_marking_pattern_confirm' THEN '这些斑驳或条纹看起来像一直稳定存在的固有花纹吗？'
    WHEN 'q_uniform_browning_confirm' THEN '是不是整片叶子几乎一起变褐？'
    WHEN 'q_yellowing_patchy_confirm' THEN '叶片是不是局部一块块发黄？'
    ELSE `question_text_user_cn`
  END,
  `help_text_cn` = CASE `question_key`
    WHEN 'q_chewed_edges_confirm' THEN '只确认边缘有没有真实缺口；发干、发焦、变色或旧伤痕迹不算真实缺口。'
    WHEN 'q_holes_in_leaf_confirm' THEN '只确认是否真的破洞或缺失；表面斑点、焦边或旧伤造成的外观变化不算真实破洞。'
    WHEN 'q_irregular_blotches_confirm' THEN '如果更像规则的小圆斑，不按“不规则斑块”处理。'
    WHEN 'q_leaf_yellowing_confirm' THEN '先排除拍摄反光、光线偏色或只是轻微变浅。'
    WHEN 'q_patchy_browning_confirm' THEN '如果整片叶子一起变褐，不按“局部褐斑”处理。'
    WHEN 'q_root_rot_black_roots' THEN '健康根通常偏白或浅色；泥土染色需要结合手感和气味判断。'
    WHEN 'q_skeletonized_leaves_confirm' THEN '只确认是否出现网状缺失；单纯变薄、焦枯或旧伤痕迹不算。'
    WHEN 'q_stable_marking_new_growth_consistent' THEN '如果只有旧叶有、新叶没有，稳定固有花纹的可能性会降低。'
    WHEN 'q_stable_marking_pattern_confirm' THEN '重点回想它是否最近才突然变多、变乱或变深。'
    WHEN 'q_uniform_browning_confirm' THEN '如果只是零散小斑点，不按整叶变褐处理。'
    WHEN 'q_uniform_browning_crispy_edges' THEN '只确认干脆卷边这个事实，不直接要求用户判断病斑或灼伤。'
    WHEN 'q_yellowing_patchy_confirm' THEN '如果整片叶子均匀发黄，不按局部黄斑处理。'
    ELSE `help_text_cn`
  END
WHERE `question_key` IN (
  'q_anthracnose_concentric',
  'q_anthracnose_sunken',
  'q_bacterial_water_soaked',
  'q_bud_drop_low_humidity_damage',
  'q_underwater_dry_wilt',
  'q_chewed_edges_confirm',
  'q_edema_blisters',
  'q_edema_warty',
  'q_flower_abort_low_humidity_damage',
  'q_gnat_small_flies',
  'q_gray_mold_white_fuzz',
  'q_holes_in_leaf_confirm',
  'q_sticky_honeydew_confirm',
  'q_sooty_mold_confirm',
  'q_iron_new_leaves_yellow',
  'q_iron_not_old_first',
  'q_leaf_margin_necrosis_confirm',
  'q_leaf_margin_necrosis_v_shaped_lesions',
  'q_leaf_mosaic_mottling_confirm',
  'q_brown_spots_halo_confirm',
  'q_black_spots_surface_layer_check',
  'q_leaf_yellowing_confirm',
  'q_nitrogen_old_leaves_yellow',
  'q_nitrogen_uniform_yellow',
  'q_root_rot_bad_smell',
  'q_root_rot_black_roots',
  'q_root_rot_mushy_roots',
  'q_root_rot_wet_soil_wilt',
  'q_rust_pustules_visible',
  'q_rust_orange_spots',
  'q_skeletonized_leaves_confirm',
  'q_spider_webbing_visible',
  'q_stem_collapse_confirm',
  'q_tunnels_in_leaf_confirm',
  'q_uniform_browning_crispy_edges',
  'q_water_soaked_stem_confirm',
  'q_wind_damage_crispy_edges',
  'q_leaf_yellowing_fertilization_background',
  'q_yellowing_patchy_yellow_speckling',
  'q_irregular_blotches_confirm',
  'q_patchy_browning_confirm',
  'q_stable_marking_new_growth_consistent',
  'q_stable_marking_pattern_confirm',
  'q_uniform_browning_confirm',
  'q_yellowing_patchy_confirm'
);
