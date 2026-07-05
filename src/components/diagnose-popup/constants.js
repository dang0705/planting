/* oxlint-disable no-magic-numbers */

export const AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY = '__plantsight_diagnose_automation_images__'

export const DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX =
  '__plantsight_diagnose_question_package__'

export const SYMPTOM_CLASS_QUICK_SELECT_OPTIONS = [
  {
    classKey: 'wilting_droop_mode',
    classNameCn: '枯萎 / 发蔫模式',
    symptomKey: 'wilting_droop',
    symptomCn: '枯萎 / 发蔫'
  },
  {
    classKey: 'yellowing_mode',
    classNameCn: '黄叶模式',
    symptomKey: 'uniform_yellowing',
    symptomCn: '整叶黄化'
  },
  {
    classKey: 'bacterial_leaf_spot_mode',
    classNameCn: '细菌性叶斑模式',
    symptomKey: 'water_soaked_spots',
    symptomCn: '水渍斑'
  },
  {
    classKey: 'chewing_pest_mode',
    classNameCn: '咀嚼损伤虫害模式',
    symptomKey: 'holes_in_leaf',
    symptomCn: '叶片穿孔'
  },
  {
    classKey: 'edema_overwater_mode',
    classNameCn: '水肿/过湿模式',
    symptomKey: 'edema',
    symptomCn: '水肿'
  },
  {
    classKey: 'flower_stress_mode',
    classNameCn: '花器胁迫模式',
    symptomKey: 'bud_drop',
    symptomCn: '掉花苞'
  },
  {
    classKey: 'fungal_leaf_spot_mode',
    classNameCn: '真菌性叶斑模式',
    symptomKey: 'brown_spots_halo',
    symptomCn: '褐斑带黄晕'
  },
  {
    classKey: 'general_stress_mode',
    classNameCn: '泛胁迫保守模式',
    symptomKey: 'distorted_growth',
    symptomCn: '整体畸形'
  },
  {
    classKey: 'gray_mold_mode',
    classNameCn: '灰霉模式',
    symptomKey: 'gray_fuzzy_mold',
    symptomCn: '灰色绒霉'
  },
  {
    classKey: 'humidity_stress_mode',
    classNameCn: '湿度胁迫模式',
    symptomKey: 'low_humidity_damage',
    symptomCn: '低湿伤害'
  },
  {
    classKey: 'leaf_edge_necrosis_mode',
    classNameCn: '叶缘坏死模式',
    symptomKey: 'leaf_margin_necrosis',
    symptomCn: '叶缘坏死'
  },
  {
    classKey: 'leaf_spot_complex_mode',
    classNameCn: '复合叶斑模式',
    symptomKey: 'irregular_blotches',
    symptomCn: '不规则斑块'
  },
  {
    classKey: 'leafminer_mode',
    classNameCn: '潜叶损伤模式',
    symptomKey: 'tunnels_in_leaf',
    symptomCn: '叶内潜道'
  },
  {
    classKey: 'light_stress_mode',
    classNameCn: '光照胁迫模式',
    symptomKey: 'leaf_bleaching',
    symptomCn: '叶片漂白'
  },
  {
    classKey: 'mechanical_damage_mode',
    classNameCn: '机械损伤模式',
    symptomKey: 'wind_damage',
    symptomCn: '风伤'
  },
  {
    classKey: 'mite_damage_mode',
    classNameCn: '螨害模式',
    symptomKey: 'fine_webbing',
    symptomCn: '细密蛛网'
  },
  {
    classKey: 'natural_aging_mode',
    classNameCn: '自然老化模式',
    symptomKey: 'normal_leaf_aging_stable',
    symptomCn: '底部老叶稳定黄化'
  },
  {
    classKey: 'nutrient_stress_mode',
    classNameCn: '营养胁迫模式',
    symptomKey: 'vein_darkening',
    symptomCn: '叶脉变深'
  },
  {
    classKey: 'powdery_mildew_mode',
    classNameCn: '白粉模式',
    symptomKey: 'white_fuzz',
    symptomCn: '白色菌丝'
  },
  {
    classKey: 'root_rot_wet_wilt_mode',
    classNameCn: '湿土萎蔫/根腐模式',
    symptomKey: 'wilting_wet_soil',
    symptomCn: '湿土萎蔫'
  },
  {
    classKey: 'rust_mode',
    classNameCn: '锈病模式',
    symptomKey: 'rust_pustules',
    symptomCn: '锈孢子堆'
  },
  {
    classKey: 'salt_dry_edge_mode',
    classNameCn: '盐害/干边模式',
    symptomKey: 'tip_burn',
    symptomCn: '叶尖焦枯'
  },
  {
    classKey: 'sap_sucking_honeydew_pest_mode',
    classNameCn: '刺吸蜜露型虫害模式',
    symptomKey: 'white_flies',
    symptomCn: '有白色小飞虫，一碰会飞起来'
  },
  {
    classKey: 'soft_rot_mode',
    classNameCn: '软腐模式',
    symptomKey: 'soft_stem',
    symptomCn: '茎变软'
  },
  {
    classKey: 'soil_moisture_pest_mode',
    classNameCn: '盆土过湿相关模式',
    symptomKey: 'small_flies_soil',
    symptomCn: '土壤小飞虫'
  },
  {
    classKey: 'temperature_stress_mode',
    classNameCn: '温度胁迫模式',
    symptomKey: 'heat_stress',
    symptomCn: '高温胁迫'
  },
  {
    classKey: 'thrips_damage_mode',
    classNameCn: '蓟马损伤模式',
    symptomKey: 'yellow_speckling',
    symptomCn: '点刺状黄化'
  },
  {
    classKey: 'virus_mosaic_mode',
    classNameCn: '病毒花叶模式',
    symptomKey: 'leaf_mosaic_mottling',
    symptomCn: '叶子上有深浅不一、花花绿绿的斑驳花纹'
  },
  {
    classKey: 'water_stress_mode',
    classNameCn: '水分胁迫模式',
    symptomKey: 'wilting_dry_soil',
    symptomCn: '干土萎蔫'
  }
]
