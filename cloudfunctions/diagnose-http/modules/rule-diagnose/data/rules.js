'use strict'

/**
 * 诊断规则知识库 v2
 * symptoms: { symptom_id: weight }  正数=支持该诊断，负数=排除该诊断
 * conditions: { condition_key: { value: weight } }
 */
const diagnosisRules = [
  {
    id: 'overwatering',
    name: '浇水过多',
    priority: 10,
    symptoms: {
      yellow_leaves: 4,
      soft_leaves: 3,
      leaf_drop: 3,
      mold_on_soil: 4,
      wilting: 2,
      brown_tips: 1,
      root_smell: 3,
      dry_crispy_leaves: -4
    },
    conditions: {
      soil_moisture: { wet: 6, normal: 2, dry: -6 },
      watering_frequency: { frequent: 5, normal: 1, rare: -5 }
    },
    mutuallyExclusiveWith: ['underwatering'],
    solutions: [
      '立即停止浇水，让土壤彻底干燥',
      '检查排水孔是否畅通，确保盆底有排水孔',
      '将植物移至通风处加速土壤干燥',
      '若根部已腐烂，需修剪腐烂根系并换新土重新种植'
    ],
    prevention: [
      '浇水前用手指插入土壤2-3cm，感觉干燥再浇',
      '选用排水良好的培养土',
      '根据季节调整浇水频率，冬季减少浇水'
    ]
  },
  {
    id: 'underwatering',
    name: '缺水干旱',
    priority: 10,
    symptoms: {
      wilting: 4,
      dry_crispy_leaves: 4,
      brown_tips: 3,
      leaf_curl: 3,
      yellow_leaves: 1,
      leaf_drop: 2,
      slow_growth: 2,
      soft_leaves: -3,
      mold_on_soil: -3
    },
    conditions: {
      soil_moisture: { dry: 6, normal: 1, wet: -6 },
      watering_frequency: { rare: 5, normal: 1, frequent: -5 }
    },
    mutuallyExclusiveWith: ['overwatering'],
    solutions: [
      '立即彻底浇水，直到水从排水孔流出',
      '将盆浸入水中15-30分钟让土壤充分吸水',
      '增加浇水频率，保持土壤适度湿润',
      '检查是否需要换更大的盆'
    ],
    prevention: ['建立规律的浇水计划', '夏季高温时增加浇水频率', '使用保水性好的培养土']
  },
  {
    id: 'root_rot',
    name: '根腐病',
    priority: 10,
    symptoms: {
      wilting: 4,
      yellow_leaves: 3,
      soft_leaves: 3,
      root_smell: 5,
      mold_on_soil: 3,
      leaf_drop: 3,
      brown_stems: 3,
      dry_crispy_leaves: -3
    },
    conditions: {
      soil_moisture: { wet: 7, normal: 2, dry: -4 },
      watering_frequency: { frequent: 5, normal: 2, rare: -3 }
    },
    mutuallyExclusiveWith: ['underwatering'],
    solutions: [
      '立即将植物从盆中取出，检查根系',
      '用剪刀剪去所有变黑、变软、有异味的根',
      '用杀菌剂（如多菌灵）处理伤口',
      '换新的排水良好的培养土重新种植',
      '减少浇水，保持土壤微湿即可'
    ],
    prevention: ['使用排水良好的培养土，避免积水', '盆底必须有排水孔', '浇水前确认土壤已干燥']
  },
  {
    id: 'nutrient_deficiency',
    name: '营养缺乏',
    priority: 7,
    symptoms: {
      yellow_leaves: 4,
      pale_leaves: 4,
      slow_growth: 4,
      small_leaves: 3,
      brown_tips: 2,
      leaf_drop: 2,
      fine_webbing: -3,
      sticky_residue: -3
    },
    conditions: {
      fertilizer_recent: { no: 5, yes: -4 },
      repot_recent: { no: 3, yes: -2 }
    },
    solutions: [
      '施用均衡的液体肥料（氮磷钾比例均衡）',
      '缺铁导致的黄化可施用螯合铁',
      '每2-4周施肥一次（生长季节）',
      '考虑换盆更新培养土'
    ],
    prevention: [
      '生长季节定期施肥',
      '每1-2年换盆一次，补充新鲜培养土',
      '使用含微量元素的专用培养土'
    ]
  },
  {
    id: 'sunburn',
    name: '日灼/晒伤',
    priority: 8,
    symptoms: {
      brown_patches: 5,
      dry_crispy_leaves: 3,
      bleached_leaves: 4,
      brown_tips: 3,
      wilting: 2,
      soft_leaves: -3,
      fine_webbing: -3
    },
    conditions: {
      light: { direct_strong: 7, bright_indirect: 1, low: -5 },
      season: { summer: 3, spring: 1, autumn: 0, winter: -2 }
    },
    mutuallyExclusiveWith: ['low_light'],
    solutions: [
      '立即将植物移离强烈直射阳光',
      '放置在明亮的散射光环境中',
      '受损叶片无法恢复，可剪去影响美观的叶片',
      '夏季高温时避免中午直晒'
    ],
    prevention: [
      '避免突然将植物从阴暗处移至强光处',
      '夏季用遮阳网过滤强光',
      '了解植物的光照需求，选择合适位置'
    ]
  },
  {
    id: 'low_light',
    name: '光照不足',
    priority: 7,
    symptoms: {
      pale_leaves: 4,
      slow_growth: 4,
      leggy_growth: 5,
      small_leaves: 3,
      yellow_leaves: 2,
      leaf_drop: 2,
      brown_patches: -3
    },
    conditions: {
      light: { low: 7, medium: 2, bright_indirect: -2, direct_strong: -5 }
    },
    mutuallyExclusiveWith: ['sunburn'],
    solutions: [
      '将植物移至光线更充足的位置',
      '考虑使用植物补光灯',
      '清洁叶片灰尘，提高光合效率',
      '减少施肥，避免徒长'
    ],
    prevention: [
      '了解植物的光照需求，选择合适位置',
      '定期旋转花盆，确保各面均匀受光',
      '冬季可使用补光灯'
    ]
  },
  {
    id: 'powdery_mildew',
    name: '白粉病',
    priority: 9,
    symptoms: {
      white_powder: 6,
      white_spots: 4,
      yellow_leaves: 2,
      distorted_growth: 2,
      leaf_drop: 1,
      fine_webbing: -4,
      sticky_residue: -3
    },
    conditions: {
      humidity: { high: 3, normal: 2, low: -2 },
      ventilation: { poor: 4, normal: 1, good: -3 }
    },
    solutions: [
      '用小苏打溶液（1茶匙/升水）喷洒叶片',
      '使用专用杀菌剂（如三唑酮）',
      '剪去严重感染的叶片并销毁',
      '改善通风条件，降低湿度'
    ],
    prevention: ['保持良好通风，避免叶片长期潮湿', '避免过度密植', '定期检查叶片，早发现早处理']
  },
  {
    id: 'fungal_leaf_spot',
    name: '真菌性叶斑病',
    priority: 8,
    symptoms: {
      brown_spots: 5,
      yellow_halo: 4,
      black_spots: 4,
      leaf_drop: 3,
      yellow_leaves: 2,
      white_powder: -3,
      fine_webbing: -4
    },
    conditions: {
      humidity: { high: 5, normal: 2, low: -3 },
      ventilation: { poor: 4, normal: 1, good: -2 }
    },
    solutions: [
      '剪去所有感染叶片，避免病菌扩散',
      '使用铜基杀菌剂或多菌灵喷洒',
      '浇水时避免叶片沾水',
      '改善通风，降低环境湿度'
    ],
    prevention: ['浇水时从基部浇，避免叶片潮湿', '保持良好通风', '及时清理落叶，减少病菌来源']
  },
  {
    id: 'spider_mites',
    name: '红蜘蛛（叶螨）',
    priority: 9,
    symptoms: {
      fine_webbing: 6,
      stippled_leaves: 5,
      yellow_leaves: 3,
      dry_crispy_leaves: 2,
      pale_leaves: 2,
      white_powder: -4,
      sticky_residue: -2
    },
    conditions: {
      humidity: { low: 5, normal: 1, high: -4 },
      season: { summer: 3, spring: 2, autumn: 1, winter: -1 }
    },
    solutions: [
      '用强水流冲洗叶片背面，物理去除螨虫',
      '使用杀螨剂（如阿维菌素）喷洒',
      '提高环境湿度，红蜘蛛不喜潮湿环境',
      '每隔5-7天处理一次，连续3次'
    ],
    prevention: ['保持适当湿度，定期向叶片喷水', '定期检查叶片背面', '隔离新购入的植物，观察2周']
  },
  {
    id: 'aphids',
    name: '蚜虫',
    priority: 8,
    symptoms: {
      sticky_residue: 4,
      distorted_growth: 4,
      visible_insects: 5,
      yellow_leaves: 3,
      curled_leaves: 3,
      fine_webbing: -3,
      white_powder: -3
    },
    conditions: {
      season: { spring: 4, summer: 3, autumn: 2, winter: -2 }
    },
    solutions: [
      '用手或棉签直接清除蚜虫',
      '用肥皂水（几滴洗洁精/升水）喷洒',
      '使用吡虫啉等杀虫剂',
      '引入天敌（瓢虫）进行生物防治'
    ],
    prevention: [
      '定期检查新芽和叶片背面',
      '避免过度施氮肥，嫩芽过多易招蚜虫',
      '保持植物健康，增强抵抗力'
    ]
  },
  {
    id: 'whiteflies',
    name: '粉虱',
    priority: 7,
    symptoms: {
      visible_insects: 5,
      sticky_residue: 4,
      yellow_leaves: 3,
      pale_leaves: 2,
      leaf_drop: 2,
      fine_webbing: -3
    },
    conditions: {
      ventilation: { poor: 4, normal: 1, good: -2 },
      season: { summer: 3, spring: 2, autumn: 1, winter: -1 }
    },
    solutions: [
      '使用黄色粘虫板诱捕成虫',
      '用吡虫啉或噻虫嗪喷洒',
      '改善通风条件',
      '每隔5天处理一次，连续3次'
    ],
    prevention: ['保持良好通风', '使用黄色粘虫板监测', '隔离新购入的植物']
  },
  {
    id: 'scale_insects',
    name: '介壳虫',
    priority: 8,
    symptoms: {
      brown_bumps: 6,
      sticky_residue: 4,
      yellow_leaves: 3,
      slow_growth: 2,
      sooty_mold: 3,
      fine_webbing: -4,
      white_powder: -3
    },
    conditions: {},
    solutions: [
      '用酒精棉签逐个擦除介壳虫',
      '用矿物油喷洒窒息虫体',
      '使用吡虫啉等内吸性杀虫剂',
      '严重时剪去感染枝条'
    ],
    prevention: ['定期检查茎干和叶片背面', '隔离新购入的植物', '保持植物健康，增强抵抗力']
  },
  {
    id: 'fungus_gnat',
    name: '菌蚊（小飞虫）',
    priority: 6,
    symptoms: {
      small_flies: 6,
      mold_on_soil: 3,
      slow_growth: 2,
      wilting: 1,
      dry_crispy_leaves: -3
    },
    conditions: {
      soil_moisture: { wet: 5, normal: 2, dry: -4 },
      watering_frequency: { frequent: 4, normal: 1, rare: -3 }
    },
    solutions: [
      '让土壤表面彻底干燥，幼虫无法在干燥土壤中存活',
      '使用黄色粘虫板捕捉成虫',
      '在土壤表面铺一层沙子或珍珠岩',
      '使用苏云金杆菌（Bt）处理土壤'
    ],
    prevention: [
      '避免过度浇水，保持土壤表面干燥',
      '使用排水良好的培养土',
      '定期检查土壤，发现幼虫及时处理'
    ]
  },
  {
    id: 'temperature_stress',
    name: '温度胁迫（冷害/热害）',
    priority: 7,
    symptoms: {
      wilting: 3,
      brown_patches: 3,
      leaf_drop: 4,
      yellow_leaves: 3,
      distorted_growth: 2,
      black_spots: 2,
      fine_webbing: -3,
      white_powder: -3
    },
    conditions: {
      temperature: { cold: 6, hot: 4, normal: -3 },
      season: { winter: 4, summer: 3, spring: 0, autumn: 0 }
    },
    solutions: [
      '将植物移至温度适宜的环境（大多数植物适宜15-25°C）',
      '避免放置在空调/暖气出风口附近',
      '冬季注意防寒，夏季注意防暑',
      '受损叶片可剪去，等待新叶生长'
    ],
    prevention: [
      '了解植物的适宜温度范围',
      '避免温度骤变，不要突然移至温差大的环境',
      '冬季远离冷窗，夏季避免强烈热辐射'
    ]
  }
]

module.exports = { diagnosisRules }
