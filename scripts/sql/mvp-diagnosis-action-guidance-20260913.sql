-- 青花植 MVP 诊断建议与规避动作
-- 目标环境：cloud1-2grufevs395a9d5e / cloud1_dev
-- 执行前必须确认 action_items_json 尚不存在，并确认新增 outcome_key 不存在。

ALTER TABLE cloud1_dev.outcome_action_profiles
  ADD COLUMN action_items_json JSON NOT NULL AFTER retake_or_escalate_json;

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_chewing_pest_inspect_01','categoryId','inspection_monitoring','stage','today','methodId','inspection','text','检查叶片正反面、叶柄和嫩梢，重点看咬痕、虫体、虫粪或细网，再决定是否进入虫害处理。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_chewing_pest_isolate_01','categoryId','isolation_sanitation','stage','today','methodId','isolation','text','如果发现活虫或受害范围正在扩大，先把植株与其他植物分开。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_chewing_pest_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_unconfirmed_treatment','text','没有确认害虫种类前，不要直接喷药，也不要混用多种药剂。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
) WHERE action_profile_key = 'action_chewing_pest_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_dry_air_environment_01','categoryId','environment_adjustment','stage','today','methodId','humidity_adjustment','text','移开空调、暖气或强风直吹位置，保持温和通风；再根据植物习性改善空气干燥。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_dry_air_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','连续观察 3 天新叶和叶尖是否继续干枯，记录摆放位置和浇水变化。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_dry_air_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_stress','text','不要为了补救叶尖焦枯而连续浇水、重肥或喷药。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
) WHERE action_profile_key = 'action_dry_air_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_fertilizer_repot_pause_01','categoryId','nutrition_adjustment','stage','today','methodId','nutrition_adjustment','text','如果近期刚重肥、换盆、修根或换土，先暂停继续施肥，让根区保持稳定。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_fertilizer_repot_stable_01','categoryId','environment_adjustment','stage','today','methodId','light_adjustment','text','把植株放在稳定的明亮散射光和温和通风处，减少搬动。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_fertilizer_repot_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察黄叶、萎蔫或掉叶是否继续扩大。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_fertilizer_repot_avoid_01','categoryId','nutrition_adjustment','stage','avoid','methodId','avoid_stress','text','不要继续重肥、频繁换土或同时大幅改变浇水。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_fertilizer_repot_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若出现软塌、异味或持续掉叶，补拍根茎和盆土后再升级复核。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
) WHERE action_profile_key = 'action_fertilizer_repot_stress';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_humidity_airflow_environment_01','categoryId','environment_adjustment','stage','today','methodId','airflow_adjustment','text','移开冷热风口，保持空气流动但不要让风直接吹叶片。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_humidity_airflow_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察叶片是否继续出现焦边、霉粉或水渍状斑点。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_humidity_airflow_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_stress','text','不要用长期闷湿来替代通风，也不要同时大幅浇水或喷药。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
) WHERE action_profile_key = 'action_humidity_airflow_stabilize';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_leaf_spot_isolate_01','categoryId','isolation_sanitation','stage','today','methodId','sanitation','text','先把出现明显斑点的植株与其他植物分开，清除已经严重受损的叶片并及时装袋处理。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','psu-houseplant-disease')),
  JSON_OBJECT('id','act_leaf_spot_environment_01','categoryId','environment_adjustment','stage','today','methodId','airflow_adjustment','text','加强温和通风，浇水时避开叶面，尽量让叶片在白天较快变干。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_leaf_spot_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察斑点是否扩大、连片，或是否出现新的软烂部位。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_leaf_spot_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_unconfirmed_treatment','text','没有确认病原和产品标签前，不要直接把叶斑当作真菌病乱喷药。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','psu-houseplant-disease'))
) WHERE action_profile_key = 'action_leaf_spot_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_low_light_environment_01','categoryId','environment_adjustment','stage','today','methodId','light_adjustment','text','把植株移到更稳定的明亮散射光处，避免从阴暗处突然移到暴晒位置。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_low_light_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察新叶节间是否继续拉长、叶色是否继续变淡。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_low_light_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_stress','text','不要突然暴晒，也不要把补光不足直接用一次性重肥来弥补。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
) WHERE action_profile_key = 'action_low_light_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_non_problematic_observe_01','categoryId','non_intervention','stage','today','methodId','monitoring','text','先保持当前光照、浇水和摆放位置稳定，不对稳定的自然斑纹或老叶代谢做强刺激处理。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025','rhs-houseplant-leaf-damage')),
  JSON_OBJECT('id','act_non_problematic_compare_01','categoryId','inspection_monitoring','stage','seven_day','methodId','monitoring','text','7 天内对比新叶和老叶，确认斑纹或黄化是否稳定、是否继续扩散。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_non_problematic_avoid_01','categoryId','non_intervention','stage','avoid','methodId','avoid_stress','text','不要因为一次拍照看到的稳定斑纹或底部老叶发黄而重肥、重药或大幅换环境。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','rhs-houseplant-leaf-damage'))
) WHERE action_profile_key = 'action_non_problematic_observe';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_nutrient_check_01','categoryId','nutrition_adjustment','stage','today','methodId','nutrition_adjustment','text','先核对最近 1-2 个生长周期是否长期没有补充适合该植物的营养。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_nutrient_supply_01','categoryId','nutrition_adjustment','stage','today','methodId','nutrition_adjustment','text','如果植株仍在生长期且根区状态正常，再按产品标签从温和、少量的方式恢复营养。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_nutrient_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察是否继续快速黄化，不要连续追肥。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_nutrient_avoid_01','categoryId','nutrition_adjustment','stage','avoid','methodId','avoid_stress','text','不要一次性重肥猛补，也不要和大幅浇水调整同时进行。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_nutrient_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若新叶持续脉间黄化或老叶快速扩大，补拍新老叶对比和盆土状态。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025'))
) WHERE action_profile_key = 'action_nutrient_support_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_old_injury_stable_01','categoryId','non_intervention','stage','today','methodId','monitoring','text','先保持环境稳定，已经形成的机械损伤或旧伤通常不会自行恢复。','sourceRefIds',JSON_ARRAY('rhs-houseplant-leaf-damage','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_old_injury_check_01','categoryId','inspection_monitoring','stage','seven_day','methodId','monitoring','text','7 天内观察是否出现新的损伤或边缘继续扩大，以区分旧伤和正在发生的问题。','sourceRefIds',JSON_ARRAY('rhs-houseplant-leaf-damage')),
  JSON_OBJECT('id','act_old_injury_avoid_01','categoryId','non_intervention','stage','avoid','methodId','avoid_stress','text','不要为了让旧伤恢复而反复加水、加肥或喷药。','sourceRefIds',JSON_ARRAY('rhs-houseplant-leaf-damage'))
) WHERE action_profile_key = 'action_old_injury_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_overwatering_stop_01','categoryId','water_adjustment','stage','today','methodId','water_adjustment','text','先暂停浇水，倒掉托盘或外盆中的积水，并确认盆底能够排水。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-overwatered-indoor-plants')),
  JSON_OBJECT('id','act_overwatering_airflow_01','categoryId','environment_adjustment','stage','today','methodId','airflow_adjustment','text','改善根区和植株周围的温和通风，避免继续放在闷湿位置。','sourceRefIds',JSON_ARRAY('umd-overwatered-indoor-plants')),
  JSON_OBJECT('id','act_overwatering_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察盆土是否逐步变干，以及新叶和茎基部是否继续变软。','sourceRefIds',JSON_ARRAY('umd-overwatered-indoor-plants')),
  JSON_OBJECT('id','act_overwatering_avoid_01','categoryId','water_adjustment','stage','avoid','methodId','avoid_stress','text','不要在盆土长期潮湿时继续加水，也不要同时施肥或喷药。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-overwatered-indoor-plants')),
  JSON_OBJECT('id','act_overwatering_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若茎基部继续发软或出现明显异味，补拍根茎和盆土后升级复核。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-overwatered-indoor-plants'))
) WHERE action_profile_key = 'action_overwatering_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_root_stress_check_01','categoryId','inspection_monitoring','stage','today','methodId','inspection','text','检查盆土干湿、盆底排水、根颈硬度和是否有异味，再决定控水还是补水。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-overwatered-indoor-plants')),
  JSON_OBJECT('id','act_root_stress_water_01','categoryId','water_adjustment','stage','today','methodId','water_adjustment','text','按盆土实际干湿调整浇水，先解决积水或过度干燥，不要凭症状盲目加水。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-overwatered-indoor-plants')),
  JSON_OBJECT('id','act_root_stress_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内记录盆土干湿恢复速度，以及叶片和茎基部是否继续恶化。','sourceRefIds',JSON_ARRAY('umd-overwatered-indoor-plants')),
  JSON_OBJECT('id','act_root_stress_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_unconfirmed_treatment','text','未确认根部状态前，不要同时补足浇水、施肥或喷药。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_root_stress_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若出现软烂、异味、持续掉叶或根颈塌陷，补拍根系并升级复核。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
) WHERE action_profile_key = 'action_root_stress_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_sunburn_move_01','categoryId','environment_adjustment','stage','today','methodId','light_adjustment','text','先移离正午直射光和玻璃热源，保留明亮散射光并保持通风稳定。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','rhs-houseplant-leaf-damage')),
  JSON_OBJECT('id','act_sunburn_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察灼伤边界是否继续扩大，并对比新叶是否出现同样损伤。','sourceRefIds',JSON_ARRAY('rhs-houseplant-leaf-damage')),
  JSON_OBJECT('id','act_sunburn_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_stress','text','不要马上重肥或重药，也不要把受伤叶片反复暴露在强光下。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','rhs-houseplant-leaf-damage'))
) WHERE action_profile_key = 'action_sunburn_basic';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_uncertain_stable_01','categoryId','non_intervention','stage','today','methodId','monitoring','text','先保持浇水、光照、通风和摆放位置稳定，暂不做大幅调整。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_uncertain_capture_01','categoryId','retake_escalation','stage','today','methodId','retake','text','补拍整株、叶片正反面、叶柄或茎基部、盆土和摆放环境。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_uncertain_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内记录浇水、光照、通风背景和异常是否扩大或重复出现。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_uncertain_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_unconfirmed_treatment','text','证据不足时不要大幅浇水、施肥或用药。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_uncertain_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','escalate','text','若症状明显加重，优先补充清晰照片并升级人工复核。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025'))
) WHERE action_profile_key = 'action_uncertain_prepare';

UPDATE cloud1_dev.outcome_action_profiles SET action_items_json = JSON_ARRAY(
  JSON_OBJECT('id','act_underwatering_check_01','categoryId','inspection_monitoring','stage','today','methodId','inspection','text','先确认盆土确实偏干、盆底没有积水，再进行补水。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_underwatering_rehydrate_01','categoryId','water_adjustment','stage','today','methodId','water_adjustment','text','沿盆土缓慢补水，浇到盆土均匀湿润，并确认多余水分能从盆底排出。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_underwatering_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','观察叶片能否回弹，以及盆土干湿恢复速度是否正常。','sourceRefIds',JSON_ARRAY('umd-indoor-diagnose-2025')),
  JSON_OBJECT('id','act_underwatering_avoid_01','categoryId','water_adjustment','stage','avoid','methodId','avoid_stress','text','不要连续少量频繁补水又很快断水，也不要在未确认偏干前反复浇水。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_underwatering_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若补水后仍持续萎蔫，补拍根区、盆底和盆土状态。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
) WHERE action_profile_key = 'action_underwatering_basic';

INSERT INTO cloud1_dev.outcome_action_profiles
  (action_profile_key,title_cn,today_actions_json,three_day_actions_json,seven_day_observe_json,avoid_actions_json,retake_or_escalate_json,action_items_json,plant_baseline_merge_policy,review_status,data_status)
VALUES
('action_spider_mite_guidance','红蜘蛛先冲洗、再按标签杀虫/杀螨',JSON_ARRAY('先隔离植株并检查叶背'),JSON_ARRAY('连续复查叶背和细网变化'),JSON_ARRAY('7 天内记录新叶点状伤痕是否扩大'),JSON_ARRAY('不要自配肥皂水，不要随意用长效广谱药，不要混用药剂'),JSON_ARRAY('持续加重时补拍叶背并升级复核'),JSON_ARRAY(
  JSON_OBJECT('id','act_spider_mite_isolate_01','categoryId','isolation_sanitation','stage','today','methodId','isolation','text','先把植株与其他植物分开，接触后洗手并清洁接触过的工具。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_spider_mite_inspect_01','categoryId','inspection_monitoring','stage','today','methodId','inspection','text','重点检查叶背、嫩梢和细网；可用放大镜或白纸辅助确认小虫。','sourceRefIds',JSON_ARRAY('umn-spider-mites','ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_spider_mite_rinse_01','categoryId','pest_physical_control','stage','today','methodId','rinse','text','用清水冲洗叶片正反面和嫩梢，重点冲掉叶背虫体和细网；冲洗后让叶片尽快变干。','sourceRefIds',JSON_ARRAY('umn-spider-mites','ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_spider_mite_kill_01','categoryId','pest_kill_treatment','stage','today','methodId','foliar_spray','text','确认是红蜘蛛后，选择标签明确适用于室内观叶植物并针对螨类的杀虫/杀螨产品，按产品标签处理叶片正反面；先在少量叶片上试用并观察。','sourceRefIds',JSON_ARRAY('umn-spider-mites','ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_spider_mite_review_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','每 3-5 天复查叶背、点状伤痕和细网；接触性产品只对直接接触到的螨有效，可能需要按标签复查。','sourceRefIds',JSON_ARRAY('umn-spider-mites')),
  JSON_OBJECT('id','act_spider_mite_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_mixing_products','text','不要自配肥皂水，不要随意使用长效广谱药，也不要把不同药剂混在一起使用。','sourceRefIds',JSON_ARRAY('umn-spider-mites','ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_spider_mite_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','处理后仍持续扩大或严重落叶时，补拍清晰叶背和嫩梢，必要时请专业人员处理。','sourceRefIds',JSON_ARRAY('umn-spider-mites','ucipm-houseplant-problems'))
),'replace_profile_actions','audited','active'),
('action_sucking_pest_guidance','刺吸式害虫先清除、再按标签杀虫',JSON_ARRAY('先隔离并检查叶背、叶柄和缝隙'),JSON_ARRAY('连续复查虫体、蜜露和黑霉变化'),JSON_ARRAY('7 天内记录新叶和虫害范围是否继续扩大'),JSON_ARRAY('不要在没有确认害虫种类前喷药或混药'),JSON_ARRAY('虫害严重或反复出现时补拍并升级复核'),JSON_ARRAY(
  JSON_OBJECT('id','act_sucking_pest_isolate_01','categoryId','isolation_sanitation','stage','today','methodId','isolation','text','先把植株与其他植物分开，清理落叶和明显虫体，接触后洗手。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_sucking_pest_inspect_01','categoryId','inspection_monitoring','stage','today','methodId','inspection','text','检查叶背、叶柄连接处、嫩梢和狭窄缝隙，留意虫体、蜕皮、发黏和黑色霉层。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_sucking_pest_physical_01','categoryId','pest_physical_control','stage','today','methodId','rinse','text','先用清水冲洗或用棉签轻轻擦除可见虫体；严重受害的叶片及时清理。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_sucking_pest_kill_01','categoryId','pest_kill_treatment','stage','today','methodId','foliar_spray','text','确认害虫种类后，选择标签明确适用于室内观叶植物和该害虫的杀虫产品，按标签处理叶片正反面及虫体藏匿处；先小范围试用。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_sucking_pest_monitor_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内复查活虫、蜜露和黑色霉层；黄粘板只能辅助监测飞虫，不能代替处理叶背和幼虫。','sourceRefIds',JSON_ARRAY('csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_sucking_pest_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_mixing_products','text','不要在没有确认害虫种类前喷药，不要混用多种药剂，也不要把粘虫板当作唯一灭虫方法。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_sucking_pest_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若虫害严重、反复出现或怀疑藏在根部，补拍叶背、茎部和盆土后升级复核。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025'))
),'replace_profile_actions','audited','active'),
('action_thrips_guidance','蓟马先清除、监测，再按标签杀虫',JSON_ARRAY('先隔离并检查叶背、嫩梢和花部'),JSON_ARRAY('复查银白擦伤、黑色虫粪和粘虫板'),JSON_ARRAY('7 天内记录新叶和花部受害是否扩大'),JSON_ARRAY('不要只靠粘虫板，也不要在未确认前混用药剂'),JSON_ARRAY('持续扩散时补拍叶背和花部并升级复核'),JSON_ARRAY(
  JSON_OBJECT('id','act_thrips_isolate_01','categoryId','isolation_sanitation','stage','today','methodId','isolation','text','先把植株与其他植物分开，清理明显受害叶片和花部残体。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_thrips_inspect_01','categoryId','inspection_monitoring','stage','today','methodId','inspection','text','检查叶背、嫩梢、花部和缝隙，重点看银白擦伤、黑色虫粪和细小虫体。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_thrips_physical_01','categoryId','pest_physical_control','stage','today','methodId','rinse','text','用清水轻柔冲洗叶片正反面和嫩梢，清除可见虫体；受害严重的叶片及时清理。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_thrips_monitor_01','categoryId','inspection_monitoring','stage','today','methodId','sticky_trap','text','在植株附近放置粘虫板辅助监测成虫数量，并定期更换或记录变化。','sourceRefIds',JSON_ARRAY('csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_thrips_kill_01','categoryId','pest_kill_treatment','stage','today','methodId','foliar_spray','text','确认是蓟马后，选择标签明确适用于室内观叶植物和蓟马的杀虫产品，按标签处理；先在少量叶片上试用。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_thrips_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_unconfirmed_treatment','text','不要只靠粘虫板判断已经消灭蓟马，也不要在未确认前连续混用药剂。','sourceRefIds',JSON_ARRAY('csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_thrips_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若银白擦伤或黑色虫粪继续增加，补拍叶背、嫩梢和花部后升级复核。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
),'replace_profile_actions','audited','active'),
('action_leaf_miner_guidance','潜叶虫先清理受害叶，再按标签杀虫',JSON_ARRAY('先隔离并清理有潜道的叶片'),JSON_ARRAY('观察潜道是否继续延长或出现新叶潜道'),JSON_ARRAY('7 天内记录新叶受害和成虫监测变化'),JSON_ARRAY('不要把叶内潜道当作普通叶斑，也不要随意重复喷药'),JSON_ARRAY('潜道持续增加时补拍正反面叶片并升级复核'),JSON_ARRAY(
  JSON_OBJECT('id','act_leaf_miner_isolate_01','categoryId','isolation_sanitation','stage','today','methodId','isolation','text','先把受害植株与其他植物分开，剪下明显有潜道的叶片并装袋处理。','sourceRefIds',JSON_ARRAY('ucipm-leafminers','ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_leaf_miner_inspect_01','categoryId','inspection_monitoring','stage','today','methodId','inspection','text','查看叶片正反面潜道是否在延长、变宽，必要时收集成虫或拍清楚叶片细节以便确认。','sourceRefIds',JSON_ARRAY('ucipm-leafminers')),
  JSON_OBJECT('id','act_leaf_miner_trap_01','categoryId','inspection_monitoring','stage','today','methodId','sticky_trap','text','用粘虫板辅助监测成虫数量，记录变化；粘虫板不能处理叶片内部幼虫。','sourceRefIds',JSON_ARRAY('ucipm-leafminers','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_leaf_miner_kill_01','categoryId','pest_kill_treatment','stage','today','methodId','foliar_spray','text','确认是潜叶虫后，选择标签明确适用于该植物和潜叶虫的杀虫产品，按标签处理；先小范围试用并观察植株反应。','sourceRefIds',JSON_ARRAY('ucipm-leafminers')),
  JSON_OBJECT('id','act_leaf_miner_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察是否出现新的潜道；不同潜叶虫和不同虫态对处理的反应可能不同。','sourceRefIds',JSON_ARRAY('ucipm-leafminers')),
  JSON_OBJECT('id','act_leaf_miner_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_mixing_products','text','不要因为潜道没有立即消失就连续加大药量或混用药剂，先按标签和复查结果判断。','sourceRefIds',JSON_ARRAY('ucipm-leafminers')),
  JSON_OBJECT('id','act_leaf_miner_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','潜道持续增加或无法确认虫种时，补拍叶片正反面并升级复核。','sourceRefIds',JSON_ARRAY('ucipm-leafminers'))
),'replace_profile_actions','audited','active'),
('action_fungus_gnat_guidance','蕈蚊先控湿、诱捕幼虫，再按标签杀虫',JSON_ARRAY('先降低盆土长期潮湿并清理表土残体'),JSON_ARRAY('观察土表小飞虫和粘虫板数量变化'),JSON_ARRAY('7 天内记录盆土干湿和新虫出现情况'),JSON_ARRAY('不要让盆土长期潮湿，也不要把粘虫板当作唯一处理'),JSON_ARRAY('持续出现时补拍盆土表面和根区并升级复核'),JSON_ARRAY(
  JSON_OBJECT('id','act_fungus_gnat_water_01','categoryId','water_adjustment','stage','today','methodId','soil_adjustment','text','减少盆土长期潮湿，倒掉积水，并让土表在两次浇水之间适度变干。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_fungus_gnat_sanitation_01','categoryId','isolation_sanitation','stage','today','methodId','sanitation','text','清理盆面落叶、腐烂残体和周围积水，检查新购或刚搬回室内的植物。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_fungus_gnat_trap_01','categoryId','inspection_monitoring','stage','today','methodId','sticky_trap','text','在盆土附近放置黄粘虫板监测并减少成虫；粘虫板主要针对成虫，不能单独消灭土中幼虫。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_fungus_gnat_kill_01','categoryId','pest_kill_treatment','stage','today','methodId','soil_drench','text','确认盆土中有蕈蚊幼虫后，选择标签明确适用于室内植物盆土和蕈蚊幼虫的生物或杀虫处理，按产品标签灌根。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_fungus_gnat_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内复查土表、粘虫板和盆土干湿变化，确认成虫数量是否下降。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_fungus_gnat_avoid_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_stress','text','不要继续过量浇水，也不要只反复捕捉成虫后就认为幼虫已经处理完成。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','csu-houseplant-pests-2025')),
  JSON_OBJECT('id','act_fungus_gnat_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若仍持续出现或植株伴随萎蔫、长势变弱，补拍盆土和根区后升级复核。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems'))
),'replace_profile_actions','audited','active'),
('action_powdery_mildew_guidance','白粉病先改善环境，必要时按标签杀菌',JSON_ARRAY('先隔离、改善通风并减少叶面长时间潮湿'),JSON_ARRAY('观察白粉是否继续扩展'),JSON_ARRAY('7 天内记录新叶和茎部是否出现新的白粉'),JSON_ARRAY('不要把白粉病药剂和其他药剂随意混用，也不要忽略产品标签中的植株耐受和安全要求'),JSON_ARRAY('扩展或反复出现时补拍白粉覆盖部位并升级复核'),JSON_ARRAY(
  JSON_OBJECT('id','act_powdery_mildew_isolate_01','categoryId','isolation_sanitation','stage','today','methodId','isolation','text','先把植株与其他植物分开，清理明显受害的叶片和残体，接触后清洁双手和工具。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','ucipm-powdery-mildew')),
  JSON_OBJECT('id','act_powdery_mildew_environment_01','categoryId','environment_adjustment','stage','today','methodId','airflow_adjustment','text','改善空气流动并提供更明亮、稳定的光照；浇水尽量安排在白天，让叶面较快变干。','sourceRefIds',JSON_ARRAY('ucipm-houseplant-problems','ucipm-powdery-mildew')),
  JSON_OBJECT('id','act_powdery_mildew_kill_01','categoryId','disease_kill_treatment','stage','today','methodId','foliar_spray','text','确认是白粉病且环境调整后仍在扩展时，选择标签明确适用于该植物和白粉病的杀菌剂，按标签尽早处理并覆盖需要保护的部位；先小范围试用。','sourceRefIds',JSON_ARRAY('ucipm-powdery-mildew','ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_powdery_mildew_observe_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内观察白粉覆盖范围和新生长部位；白粉已经大面积覆盖时，处理难度会增加。','sourceRefIds',JSON_ARRAY('ucipm-powdery-mildew')),
  JSON_OBJECT('id','act_powdery_mildew_safety_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_mixing_products','text','不要把油剂、硫制剂或其他药剂自行混用；使用前检查产品标签的间隔、温度和植株安全要求。','sourceRefIds',JSON_ARRAY('ucipm-powdery-mildew')),
  JSON_OBJECT('id','act_powdery_mildew_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','若白粉继续扩展或无法确认病害类型，补拍叶片正反面、茎部和摆放环境后升级复核。','sourceRefIds',JSON_ARRAY('ucipm-powdery-mildew','ucipm-houseplant-problems'))
),'replace_profile_actions','audited','active'),
('action_sooty_mold_guidance','煤污病先找蜜露害虫，再清洗霉层',JSON_ARRAY('先隔离并检查叶背、叶柄和茎部是否有产蜜露害虫'),JSON_ARRAY('清洗叶面后复查是否重新出现黑色霉层'),JSON_ARRAY('7 天内记录发黏、虫体和霉层是否反复'),JSON_ARRAY('不要看到黑色霉层就直接喷杀菌剂，也不要忽略背后的害虫来源'),JSON_ARRAY('找不到害虫来源或霉层反复时补拍叶背和茎部并升级复核'),JSON_ARRAY(
  JSON_OBJECT('id','act_sooty_mold_isolate_01','categoryId','isolation_sanitation','stage','today','methodId','isolation','text','先把植株与其他植物分开，避免蜜露和害虫继续扩散，接触后清洁双手和工具。','sourceRefIds',JSON_ARRAY('ucipm-sooty-mold-2020','ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_sooty_mold_inspect_01','categoryId','inspection_monitoring','stage','today','methodId','inspection','text','检查叶背、叶柄连接处和茎部是否有蚜虫、粉蚧、介壳虫、白粉虱等害虫，以及透明发黏的蜜露。','sourceRefIds',JSON_ARRAY('ucipm-sooty-mold-2020','ucipm-houseplant-problems')),
  JSON_OBJECT('id','act_sooty_mold_clean_01','categoryId','pest_physical_control','stage','today','methodId','rinse','text','先处理确认到的害虫，再用清水轻柔清洗叶面黑色霉层；清洗后让叶片尽快变干。','sourceRefIds',JSON_ARRAY('ucipm-sooty-mold-2020')),
  JSON_OBJECT('id','act_sooty_mold_monitor_01','categoryId','inspection_monitoring','stage','three_day','methodId','monitoring','text','3 天内复查是否重新发黏或出现新的黑色霉层；反复出现通常说明蜜露害虫来源仍未解决。','sourceRefIds',JSON_ARRAY('ucipm-sooty-mold-2020')),
  JSON_OBJECT('id','act_sooty_mold_safety_01','categoryId','treatment_safety','stage','avoid','methodId','avoid_unconfirmed_treatment','text','不要看到黑色霉层就直接喷杀菌剂；先确认并处理产生蜜露的害虫来源。','sourceRefIds',JSON_ARRAY('ucipm-sooty-mold-2020')),
  JSON_OBJECT('id','act_sooty_mold_escalate_01','categoryId','retake_escalation','stage','seven_day','methodId','retake','text','如果找不到害虫来源、霉层反复或植株继续衰弱，补拍叶背、茎部和盆土后升级复核。','sourceRefIds',JSON_ARRAY('ucipm-sooty-mold-2020','ucipm-houseplant-problems'))
),'replace_profile_actions','audited','active');

INSERT INTO cloud1_dev.diagnosis_outcomes
  (outcome_key,problem_key,outcome_name_cn,outcome_type,outcome_category,display_name_cn,user_definition_cn,action_profile_key,risk_level,is_final_output,is_intermediate_node,allow_direct_close,allow_uncertain_close,priority,review_status,data_status)
VALUES
('spider_mite','spider_mite','红蜘蛛（叶螨）','problematic','pest','红蜘蛛（叶螨）','叶片出现细网、点状失绿或叶背可见微小螨体时，优先按叶螨方向处理。','action_spider_mite_guidance','medium',1,0,1,0,90,'audited','active'),
('mealybug','mealybug','白色棉粉虫（粉蚧）','problematic','pest','白色棉粉虫（粉蚧）','叶背、叶柄或茎部出现白色棉絮状虫体时，优先按粉蚧方向处理。','action_sucking_pest_guidance','medium',1,0,1,0,89,'audited','active'),
('scale_insect','scale_insect','小硬壳虫（介壳虫）','problematic','pest','小硬壳虫（介壳虫）','叶片、叶柄或茎部出现固定的硬壳状小虫时，优先按介壳虫方向处理。','action_sucking_pest_guidance','medium',1,0,1,0,88,'audited','active'),
('whitefly','whitefly','白色小飞虫（白粉虱）','problematic','pest','白色小飞虫（白粉虱）','叶背出现白色小飞虫或固定的幼虫时，优先按白粉虱方向处理。','action_sucking_pest_guidance','medium',1,0,1,0,87,'audited','active'),
('aphid','aphid','成群小软虫（蚜虫）','problematic','pest','成群小软虫（蚜虫）','嫩梢或叶背出现成群小软虫、发黏或卷曲时，优先按蚜虫方向处理。','action_sucking_pest_guidance','medium',1,0,1,0,86,'audited','active'),
('thrips','thrips','蓟马','problematic','pest','蓟马','叶片或花部出现银白擦伤、黑色虫粪或可见细小虫体时，优先按蓟马方向处理。','action_thrips_guidance','medium',1,0,1,0,85,'audited','active'),
('leaf_miner','leaf_miner','叶子里的潜道虫','problematic','pest','叶子里的潜道虫','叶片内部出现蛇形或隧道状潜道时，优先按潜叶虫方向处理。','action_leaf_miner_guidance','medium',1,0,1,0,84,'audited','active'),
('fungus_gnat','fungus_gnat','盆土小黑飞（蕈蚊）','problematic','pest','盆土小黑飞（蕈蚊）','盆土表面潮湿并持续出现小黑飞时，优先按蕈蚊方向处理。','action_fungus_gnat_guidance','medium',1,0,1,0,83,'audited','active'),
('powdery_mildew','powdery_mildew','白粉病','problematic','disease','白粉病','叶片或茎部出现可擦见的白色粉状附着物时，优先按白粉病方向处理。','action_powdery_mildew_guidance','medium',1,0,1,0,82,'audited','active'),
('sooty_mold','sooty_mold','煤污病（霉菌）','problematic','disease','煤污病（霉菌）','叶片或茎部出现黑色霉膜时，先查找产生蜜露的害虫来源，再清洗霉层。','action_sooty_mold_guidance','medium',1,0,1,0,81,'audited','active');
