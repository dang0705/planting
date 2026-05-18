'use strict'

const metadata = {
  envId: 'cloud1-2grufevs395a9d5e',
  batchId: 'batch_20260413_ai_visual_pool_legacy_gap_closure',
  versionTag: 'v20260413_ai_legacy_gap_v1',
  auditDate: '2026-04-13',
  publishedAt: '2026-04-13 21:30:00',
  sourceType: 'manual',
  outputField: 'question_library',
  criteria: {
    symptomTable: 'symptoms',
    requiredSymptomStatus: 'audited',
    requiredSymptomTypes: ['visual', 'hybrid'],
    requiredVisualPoolFlag: 'yes'
  },
  auditSemantics: {
    questionTables:
      '正式题库以 data_status=audited + review_status=audited 作为 formal runtime coverage 发布态，并保留 source_batch_id / version_tag / review_note。',
    engineTable:
      'question_generation_engine 仅作为 source-backed audited generation asset；保留 review_status/review_note/source_batch_id/version_tag，但不参与 formal runtime coverage 统计。'
  }
}

const sourceSets = {
  spiderMites: [
    'https://www.rhs.org.uk/biodiversity/glasshouse-red-spider-mite',
    'https://gardeningsg.nparks.gov.sg/page-index/pests/spider-mites/'
  ],
  thrips: [
    'https://ipm.ucanr.edu/home-and-landscape/thrips/',
    'https://www.rhs.org.uk/biodiversity/indoor-plants-sap-feeding-insects'
  ],
  honeydewPests: [
    'https://www.rhs.org.uk/biodiversity/aphids',
    'https://www.rhs.org.uk/biodiversity/glasshouse-whitefly',
    'https://ipm.ucanr.edu/home-and-landscape/scales/',
    'https://extension.umd.edu/resource/honeydew-and-sooty-mold',
    'https://ipm.ucanr.edu/home-and-landscape/sooty-mold/'
  ],
  fungusGnats: [
    'https://extension.umn.edu/product-and-houseplant-pests/fungus-gnats',
    'https://extension.psu.edu/fungus-gnats-in-indoor-plants',
    'https://hort.extension.wisc.edu/articles/fungus-gnats-on-houseplants/'
  ],
  powderyMildew: [
    'https://www.rhs.org.uk/disease/powdery-mildews',
    'https://ag.purdue.edu/department/btny/ppdl/potw-dept-folder/2022/powdery-mildew-houseplants.html',
    'https://www.missouribotanicalgarden.org/gardens-gardening/your-garden/help-for-the-home-gardener/advice-tips-resources/insects-pests-and-problems/diseases/powdery-mildew/powdery-mildew-indoors'
  ],
  rust: [
    'https://www.rhs.org.uk/disease/rust-diseases',
    'https://extension.umn.edu/plant-diseases/rust-flower-garden'
  ],
  grayMold: [
    'https://www.rhs.org.uk/disease/grey-mould',
    'https://extension.umn.edu/plant-diseases/gray-mold-flower-garden',
    'https://extension.psu.edu/botrytis-or-gray-mold'
  ],
  bacterialLeafSpot: [
    'https://content.ces.ncsu.edu/leaf-spotting-bacteria-on-ornamentals',
    'https://extension.umn.edu/disease-management/bacterial-spot-tomato-and-pepper'
  ],
  fungalLeafSpot: [
    'https://extension.umn.edu/disease-management/alternaria-leaf-blight',
    'https://www.rhs.org.uk/advice/profile?pid=270',
    'https://www.rhs.org.uk/disease/escallonia-leaf-spot'
  ],
  anthracnose: [
    'https://extension.umn.edu/plant-diseases/anthracnose-trees-and-shrubs',
    'https://ipm.ucanr.edu/agriculture/cucurbits/anthracnose/'
  ],
  edemaWater: [
    'https://www.rhs.org.uk/problems/oedema',
    'https://ipm.ucanr.edu/PMG/GARDEN/ENVIRON/edema.html',
    'https://hort.extension.wisc.edu/articles/edema/',
    'https://www.rhs.org.uk/prevention-protection/leaf-damage-on-houseplants'
  ],
  chlorosis: [
    'https://www.rhs.org.uk/problems/chlorosis',
    'https://extension.okstate.edu/fact-sheets/identifying-and-correcting-iron-deficiencies-in-ornamentals.html',
    'https://extension.illinois.edu/plant-problems/chlorosis'
  ]
}

const closures = [
  {
    symptomKey: 'fine_webbing',
    displayTextCn: '叶子上有很细的丝网',
    closureMode: 'single',
    category: 'mite_specific',
    confirm: {
      questionKey: 'q_spider_webbing_visible',
      targetSymptomKey: 'fine_webbing',
      questionTextCn: '叶片、叶柄或节间是否能看到细密蛛网？',
      questionTextUserCn: '叶片、叶柄或节间能看到细密蛛网吗？',
      questionGroupKey: 'spider_mites_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '优先翻看叶背、新叶和节间，确认是贴附在组织上的细密虫网，而不是灰尘丝或普通纤维。',
      whyThisQuestionCn: '细密蛛网是红蜘蛛最有辨识度的可见信号之一，先确认它能快速把黄化/失绿路径收紧到螨害方向。',
      sourceKeys: ['spiderMites'],
      problemKeys: ['spider_mites'],
      strategyBase: 100,
      engineRuleKey: 'eg_spider_webbing_visible',
      engineGroup: 'spider_mites_group'
    }
  },
  {
    symptomKey: 'stippling',
    displayTextCn: '叶子上有很多细小的褪色点',
    closureMode: 'single',
    category: 'piercing_sucking_split',
    confirm: {
      questionKey: 'q_stippling_confirm',
      targetSymptomKey: 'stippling',
      questionTextCn: '叶片是否有密集、细小的点状失绿或褪色斑驳？',
      questionTextUserCn: '叶片上有密集、细小的褪色点或斑驳吗？',
      questionGroupKey: 'piercing_sucking_group',
      questionLevel: 1,
      observability: 'medium',
      priority: 90,
      helpTextCn: '重点看叶面是否为很多细碎褪色点，而不是整块大面积泛黄或单个大病斑。',
      whyThisQuestionCn: 'stippling 常见于刺吸式害虫取食损伤，是把红蜘蛛、蓟马和其他泛黄路径分开的高价值中层特征。',
      sourceKeys: ['spiderMites', 'thrips'],
      problemKeys: ['spider_mites', 'thrips'],
      strategyBase: 90,
      engineRuleKey: 'eg_stippling_confirm',
      engineGroup: 'piercing_sucking_group'
    }
  },
  {
    symptomKey: 'leaf_curl',
    displayTextCn: '叶片卷曲',
    closureMode: 'single',
    category: 'curl_split',
    confirm: {
      questionKey: 'q_leaf_curl_confirm',
      targetSymptomKey: 'leaf_curl',
      questionTextCn: '叶片是否出现明显卷曲、扭折或边缘向内/向下卷起？',
      questionTextUserCn: '叶片有明显卷曲、扭折或卷边吗？',
      questionGroupKey: 'leaf_curl_group',
      questionLevel: 1,
      observability: 'medium',
      priority: 82,
      helpTextCn: '先看卷曲是否是真实形变，而不是单纯下垂、失水发软或叶片本身自然弯曲。',
      whyThisQuestionCn: '卷曲本身不是单一病因，但它是把虫害、病毒花叶和水分应激继续分流的重要入口。',
      sourceKeys: ['spiderMites', 'thrips', 'chlorosis'],
      problemKeys: ['spider_mites', 'thrips', 'virus_mosaic', 'underwatering'],
      strategyBase: 82,
      engineRuleKey: 'eg_leaf_curl_confirm',
      engineGroup: 'leaf_curl_group'
    }
  },
  {
    symptomKey: 'silver_streaks',
    displayTextCn: '叶面有银色划痕或银斑',
    closureMode: 'single',
    category: 'thrips_specific',
    confirm: {
      questionKey: 'q_thrips_silver_streaks',
      targetSymptomKey: 'silver_streaks',
      questionTextCn: '叶面是否有银色条纹、银斑或擦伤样痕迹？',
      questionTextUserCn: '叶面有银色条纹、银斑或擦伤样痕迹吗？',
      questionGroupKey: 'thrips_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '重点看叶面在侧光下是否出现发银的擦伤样痕迹，尤其留意嫩叶、花和新梢附近。',
      whyThisQuestionCn: '银化条纹是蓟马非常典型的取食表现，用它能把蓟马和螨害、普通黄叶快速区分开。',
      sourceKeys: ['thrips'],
      problemKeys: ['thrips'],
      strategyBase: 100,
      engineRuleKey: 'eg_thrips_silver_streaks',
      engineGroup: 'thrips_group'
    }
  },
  {
    symptomKey: 'sticky_honeydew',
    displayTextCn: '叶子摸起来发黏',
    closureMode: 'single',
    category: 'honeydew_pests',
    confirm: {
      questionKey: 'q_sticky_honeydew_confirm',
      targetSymptomKey: 'sticky_honeydew',
      questionTextCn: '叶面或周围表面是否有明显发黏的蜜露/黏液？',
      questionTextUserCn: '叶面或周围表面有明显发黏的蜜露吗？',
      questionGroupKey: 'honeydew_pests_group',
      questionLevel: 1,
      observability: 'high',
      priority: 96,
      helpTextCn: '可重点摸叶面、叶柄、花盆边缘和下方桌面，确认是否真有黏性残留，而不是单纯喷药或浇水残迹。',
      whyThisQuestionCn: '黏性的蜜露会把问题优先拉向蚜虫、白粉虱、介壳虫等刺吸式害虫，是高价值分流点。',
      sourceKeys: ['honeydewPests'],
      problemKeys: ['aphids', 'whiteflies', 'scale_insects'],
      strategyBase: 96,
      engineRuleKey: 'eg_sticky_honeydew_confirm',
      engineGroup: 'honeydew_pests_group'
    }
  },
  {
    symptomKey: 'sooty_mold',
    displayTextCn: '叶子表面有黑灰一样的脏层',
    closureMode: 'single',
    category: 'honeydew_pests',
    confirm: {
      questionKey: 'q_sooty_mold_confirm',
      targetSymptomKey: 'sooty_mold',
      questionTextCn: '叶片表面是否覆有一层黑灰色、像煤污一样的覆盖层？',
      questionTextUserCn: '叶片表面有黑灰色、像煤污一样的覆盖层吗？',
      questionGroupKey: 'honeydew_pests_group',
      questionLevel: 1,
      observability: 'high',
      priority: 90,
      helpTextCn: '优先分清它是表面附着的一层灰黑覆盖物，而不是叶片组织本身坏死发黑。',
      whyThisQuestionCn: '煤污层常是蜜露后的继发表现，确认它有助于把诊断继续收紧到产蜜露的刺吸式害虫链路。',
      sourceKeys: ['honeydewPests'],
      problemKeys: ['aphids', 'whiteflies', 'scale_insects'],
      strategyBase: 90,
      engineRuleKey: 'eg_sooty_mold_confirm',
      engineGroup: 'honeydew_pests_group'
    }
  },
  {
    symptomKey: 'small_flies_soil',
    displayTextCn: '盆土附近有很多小飞虫',
    closureMode: 'single',
    category: 'fungus_gnat',
    confirm: {
      questionKey: 'q_gnat_small_flies',
      targetSymptomKey: 'small_flies_soil',
      questionTextCn: '盆土表面或花盆周围是否有很小的蚊状飞虫？',
      questionTextUserCn: '盆土表面或花盆周围有很小的蚊状飞虫吗？',
      questionGroupKey: 'fungus_gnat_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '轻碰盆沿和土表，观察是否有许多很小的黑色或灰色飞虫从盆土附近飞起。',
      whyThisQuestionCn: '真菌蚊最直接的入口信号就是“盆土附近的小飞虫”，确认它能把路径迅速收向介质长期过湿链路。',
      sourceKeys: ['fungusGnats'],
      problemKeys: ['fungus_gnat'],
      strategyBase: 100,
      engineRuleKey: 'eg_gnat_small_flies',
      engineGroup: 'fungus_gnat_group'
    }
  },
  {
    symptomKey: 'mold_on_soil',
    displayTextCn: '盆土表面长霉',
    closureMode: 'double',
    category: 'fungus_gnat',
    confirm: {
      questionKey: 'q_gnat_mold_on_soil',
      targetSymptomKey: 'mold_on_soil',
      questionTextCn: '盆土表面是否长期有白霉、灰霉或绒毛状霉层？',
      questionTextUserCn: '盆土表面长期有白霉、灰霉或绒毛状霉层吗？',
      questionGroupKey: 'fungus_gnat_group',
      questionLevel: 1,
      observability: 'medium',
      priority: 88,
      helpTextCn: '确认霉层是反复出现在盆土表面，而不是一次性残留的肥料结晶或表面灰尘。',
      whyThisQuestionCn: '土表长霉本身就提示介质长期潮湿、有机质丰富，常与真菌蚊一起出现，是高价值环境-虫害桥。',
      sourceKeys: ['fungusGnats'],
      problemKeys: ['fungus_gnat'],
      strategyBase: 88,
      engineRuleKey: 'eg_gnat_mold_on_soil',
      engineGroup: 'fungus_gnat_group'
    },
    context: {
      questionKey: 'q_gnat_soil_stays_wet',
      targetSymptomKey: 'poor_drainage',
      questionTextCn: '盆土是否经常长时间偏湿、久不干？',
      questionTextUserCn: '盆土经常长时间偏湿、久不干吗？',
      questionGroupKey: 'fungus_gnat_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 84,
      helpTextCn: '回想最近浇水后盆土多久才能回干。若表层长时间潮湿，更支持真菌蚊和过湿链路。',
      whyThisQuestionCn: '真菌蚊真正的成因不是“有飞虫”本身，而是长期过湿环境；这题用于把症状确认推进到环境根因。',
      sourceKeys: ['fungusGnats'],
      problemKeys: ['fungus_gnat', 'overwatering'],
      strategyBase: 84,
      engineRuleKey: 'eg_gnat_soil_stays_wet',
      engineGroup: 'fungus_gnat_context_group'
    }
  },
  {
    symptomKey: 'powder_white',
    displayTextCn: '叶子上有一层白粉',
    closureMode: 'double',
    category: 'powdery_mildew',
    confirm: {
      questionKey: 'q_powder_white_visible',
      targetSymptomKey: 'powder_white',
      questionTextCn: '叶面、嫩梢或花器是否有白色粉状覆盖？',
      questionTextUserCn: '叶面、嫩梢或花器有白色粉状覆盖吗？',
      questionGroupKey: 'powdery_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '优先看新叶、嫩梢、茎和花苞，确认它是“表面白粉覆盖”，不是灰尘、水渍或虫卵。',
      whyThisQuestionCn: '白粉覆盖是白粉病的核心视觉入口；先确认它是否真实存在，后续分流才有意义。',
      sourceKeys: ['powderyMildew'],
      problemKeys: ['powdery_mildew'],
      strategyBase: 100,
      engineRuleKey: 'eg_powder_white_visible',
      engineGroup: 'powdery_group'
    },
    context: {
      questionKey: 'q_powder_on_stems_or_buds',
      targetSymptomKey: 'powder_white',
      questionTextCn: '白粉是否也出现在茎、花苞或花上？',
      questionTextUserCn: '白粉也出现在茎、花苞或花上吗？',
      questionGroupKey: 'powdery_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 84,
      helpTextCn: '如果白粉不只在叶片，而是在茎和花器也出现，通常更支持白粉病而不是局部污染。',
      whyThisQuestionCn: '这是典型的加权确认题，用来把“白粉存在”从单一叶片疑似提升到更稳定的病理模式。',
      sourceKeys: ['powderyMildew'],
      problemKeys: ['powdery_mildew'],
      strategyBase: 84,
      engineRuleKey: 'eg_powder_on_stems_or_buds',
      engineGroup: 'powdery_group'
    }
  },
  {
    symptomKey: 'rust_pustules',
    displayTextCn: '锈孢子堆',
    closureMode: 'double',
    category: 'rust',
    confirm: {
      questionKey: 'q_rust_pustules_visible',
      targetSymptomKey: 'rust_pustules',
      questionTextCn: '叶面或叶背是否有橙黄、锈褐色的粉状孢子堆？',
      questionTextUserCn: '叶面或叶背有橙黄、锈褐色的粉状孢子堆吗？',
      questionGroupKey: 'rust_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '重点翻看叶背，确认是不是会掉粉、会擦出颜色的小突起，而不是干斑或泥点。',
      whyThisQuestionCn: '锈孢子堆是锈病最有辨识度的征象之一，确认它能直接把路径收向 rust。',
      sourceKeys: ['rust'],
      problemKeys: ['rust'],
      strategyBase: 100,
      engineRuleKey: 'eg_rust_pustules_visible',
      engineGroup: 'rust_group'
    },
    context: {
      questionKey: 'q_rust_orange_spots',
      targetSymptomKey: 'orange_spots',
      questionTextCn: '叶片正面是否先见黄/橙色斑点，再在背面形成粉疱？',
      questionTextUserCn: '叶片正面先见黄/橙色斑点，再在背面形成粉疱吗？',
      questionGroupKey: 'rust_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 82,
      helpTextCn: '前后表里同时看：正面斑点与背面粉疱配对出现，更支持 rust，而不是普通褐斑。',
      whyThisQuestionCn: '这题用于把单纯橙斑和真正的锈病孢子堆串成一条可验证路径，减少误把普通斑点当锈病。',
      sourceKeys: ['rust'],
      problemKeys: ['rust'],
      strategyBase: 82,
      engineRuleKey: 'eg_rust_orange_spots',
      engineGroup: 'rust_group'
    }
  },
  {
    symptomKey: 'gray_fuzzy_mold',
    displayTextCn: '表面长了灰色绒毛霉',
    closureMode: 'double',
    category: 'gray_mold',
    confirm: {
      questionKey: 'q_gray_mold_visible',
      targetSymptomKey: 'gray_fuzzy_mold',
      questionTextCn: '受害部位是否有灰色、绒毛状的霉层？',
      questionTextUserCn: '受害部位有灰色、绒毛状的霉层吗？',
      questionGroupKey: 'gray_mold_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '优先看残花、嫩组织、伤口和高湿部位，确认是蓬松灰霉层，而不是灰尘或白粉。',
      whyThisQuestionCn: '灰绒毛霉层是灰霉病的核心视觉信号，先确认它才能继续判断是否有软腐和扩展风险。',
      sourceKeys: ['grayMold'],
      problemKeys: ['gray_mold'],
      strategyBase: 100,
      engineRuleKey: 'eg_gray_mold_visible',
      engineGroup: 'gray_mold_group'
    },
    context: {
      questionKey: 'q_gray_mold_white_fuzz',
      targetSymptomKey: 'white_fuzz',
      questionTextCn: '早期是否先见白色菌丝，之后再转成灰色霉层？',
      questionTextUserCn: '早期先见白色菌丝，之后再转成灰色霉层吗？',
      questionGroupKey: 'gray_mold_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 80,
      helpTextCn: '如果先是白色绒丝、后期变灰，更支持灰霉链路，而不是单纯白粉或纤维附着。',
      whyThisQuestionCn: '把 white_fuzz 纳入灰霉上下文能减少对白粉、灰尘和灰霉的混淆。',
      sourceKeys: ['grayMold'],
      problemKeys: ['gray_mold'],
      strategyBase: 80,
      engineRuleKey: 'eg_gray_mold_white_fuzz',
      engineGroup: 'gray_mold_group'
    }
  },
  {
    symptomKey: 'water_soaked_spots',
    displayTextCn: '水渍斑',
    closureMode: 'single',
    category: 'bacterial_leaf_spot',
    confirm: {
      questionKey: 'q_bacterial_water_soaked',
      targetSymptomKey: 'water_soaked_spots',
      questionTextCn: '病斑是否有水渍感、湿润半透明？',
      questionTextUserCn: '病斑有水渍感、湿润半透明吗？',
      questionGroupKey: 'bacterial_spot_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '观察病斑是否像被水浸过一样发暗、半透明或湿润，而不是干燥、粉状或焦脆。',
      whyThisQuestionCn: '水渍感是细菌性叶斑非常重要的先验信号，用它能把路径优先收向 bacterial leaf spot。',
      sourceKeys: ['bacterialLeafSpot'],
      problemKeys: ['bacterial_leaf_spot'],
      strategyBase: 100,
      engineRuleKey: 'eg_bacterial_water_soaked',
      engineGroup: 'bacterial_spot_group'
    }
  },
  {
    symptomKey: 'brown_spots_halo',
    displayTextCn: '褐斑带黄晕',
    closureMode: 'single',
    category: 'leaf_spot_split',
    confirm: {
      questionKey: 'q_brown_spots_halo_confirm',
      targetSymptomKey: 'brown_spots_halo',
      questionTextCn: '叶片是否有褐色病斑，并在病斑周围伴随黄色晕圈？',
      questionTextUserCn: '叶片有褐色病斑，并在周围伴随黄色晕圈吗？',
      questionGroupKey: 'leaf_spot_group',
      questionLevel: 1,
      observability: 'high',
      priority: 92,
      helpTextCn: '重点看病斑中心与外围的色差，确认是“褐斑 + 黄晕”的组合，而不是单纯黄叶或均匀发褐。',
      whyThisQuestionCn: '带黄晕的褐斑常把细菌性叶斑与部分真菌叶斑拉到优先路径，是典型的分流入口。',
      sourceKeys: ['bacterialLeafSpot', 'fungalLeafSpot'],
      problemKeys: ['bacterial_leaf_spot', 'alternaria_leaf_spot'],
      strategyBase: 92,
      engineRuleKey: 'eg_brown_spots_halo_confirm',
      engineGroup: 'leaf_spot_group'
    }
  },
  {
    symptomKey: 'black_spots_spreading',
    displayTextCn: '黑斑扩散',
    closureMode: 'single',
    category: 'fungal_leaf_spot',
    confirm: {
      questionKey: 'q_black_spots_spreading_confirm',
      targetSymptomKey: 'black_spots_spreading',
      questionTextCn: '是否有逐渐扩大的黑斑或暗色斑块？',
      questionTextUserCn: '是否有逐渐扩大的黑斑或暗色斑块？',
      questionGroupKey: 'leaf_spot_group',
      questionLevel: 1,
      observability: 'high',
      priority: 90,
      helpTextCn: '观察斑块是否在扩大、加深，边界是否比周边组织更暗，而不是静止不变的旧伤或稳定斑纹。',
      whyThisQuestionCn: '扩展性黑斑是典型真菌性叶斑入口之一，能把单纯旧斑、机械伤和稳定斑纹排除出去。',
      sourceKeys: ['fungalLeafSpot'],
      problemKeys: ['alternaria_leaf_spot'],
      strategyBase: 90,
      engineRuleKey: 'eg_black_spots_spreading_confirm',
      engineGroup: 'leaf_spot_group'
    }
  },
  {
    symptomKey: 'irregular_blotches',
    displayTextCn: '不规则斑块',
    closureMode: 'single',
    category: 'fungal_leaf_spot',
    confirm: {
      questionKey: 'q_irregular_blotches_confirm',
      targetSymptomKey: 'irregular_blotches',
      questionTextCn: '病斑是否呈不规则斑块状，而不是规则圆斑？',
      questionTextUserCn: '病斑呈不规则斑块状，而不是规则圆斑吗？',
      questionGroupKey: 'leaf_spot_group',
      questionLevel: 1,
      observability: 'medium',
      priority: 84,
      helpTextCn: '先看斑块整体形状是否零散、不整齐，避免把规则圆斑或均匀焦边误当成 irregular blotch。',
      whyThisQuestionCn: '不规则斑块是多类真菌性叶斑的重要视觉表述，用它能提高 leaf spot 路径的信息增益。',
      sourceKeys: ['fungalLeafSpot'],
      problemKeys: ['alternaria_leaf_spot'],
      strategyBase: 84,
      engineRuleKey: 'eg_irregular_blotches_confirm',
      engineGroup: 'leaf_spot_group'
    }
  },
  {
    symptomKey: 'patchy_browning',
    displayTextCn: '局部褐变',
    closureMode: 'single',
    category: 'fungal_leaf_spot',
    confirm: {
      questionKey: 'q_patchy_browning_confirm',
      targetSymptomKey: 'patchy_browning',
      questionTextCn: '叶片是否是局部褐变，而不是整叶均匀变褐？',
      questionTextUserCn: '叶片是局部褐变，而不是整叶均匀变褐吗？',
      questionGroupKey: 'leaf_spot_group',
      questionLevel: 1,
      observability: 'medium',
      priority: 80,
      helpTextCn: '确认褐变是片状、局部的，而不是缺水或冷害造成的整叶一体化干褐。',
      whyThisQuestionCn: '局部褐变是把 fungal leaf spot 与环境性整叶褐化分开的关键一步。',
      sourceKeys: ['fungalLeafSpot'],
      problemKeys: ['alternaria_leaf_spot'],
      strategyBase: 80,
      engineRuleKey: 'eg_patchy_browning_confirm',
      engineGroup: 'leaf_spot_group'
    }
  },
  {
    symptomKey: 'concentric_rings',
    displayTextCn: '同心轮纹',
    closureMode: 'single',
    category: 'anthracnose',
    confirm: {
      questionKey: 'q_anthracnose_concentric',
      targetSymptomKey: 'concentric_rings',
      questionTextCn: '病斑上是否有明显同心轮纹？',
      questionTextUserCn: '病斑上有明显同心轮纹吗？',
      questionGroupKey: 'anthracnose_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '重点看病斑内部是否出现一圈圈深浅变化，而不是单纯颜色不均。',
      whyThisQuestionCn: '同心轮纹是炭疽和部分叶斑的重要高特异视觉信号，信息增益很高。',
      sourceKeys: ['anthracnose', 'fungalLeafSpot'],
      problemKeys: ['anthracnose', 'alternaria_leaf_spot'],
      strategyBase: 100,
      engineRuleKey: 'eg_anthracnose_concentric',
      engineGroup: 'anthracnose_group'
    }
  },
  {
    symptomKey: 'sunken_lesions',
    displayTextCn: '凹陷病斑',
    closureMode: 'single',
    category: 'anthracnose',
    confirm: {
      questionKey: 'q_anthracnose_sunken',
      targetSymptomKey: 'sunken_lesions',
      questionTextCn: '病斑是否明显下陷、凹入组织表面？',
      questionTextUserCn: '病斑明显下陷、凹入组织表面吗？',
      questionGroupKey: 'anthracnose_group',
      questionLevel: 1,
      observability: 'high',
      priority: 98,
      helpTextCn: '从侧面观察病斑是否低于周围组织表面；真凹陷比颜色深浅更有分流价值。',
      whyThisQuestionCn: '下陷病斑是炭疽类病害的强信号，能把普通叶斑和炭疽型病斑分开。',
      sourceKeys: ['anthracnose'],
      problemKeys: ['anthracnose'],
      strategyBase: 98,
      engineRuleKey: 'eg_anthracnose_sunken',
      engineGroup: 'anthracnose_group'
    }
  },
  {
    symptomKey: 'blister_like_bumps',
    displayTextCn: '泡状突起',
    closureMode: 'single',
    category: 'edema',
    confirm: {
      questionKey: 'q_edema_blisters',
      targetSymptomKey: 'blister_like_bumps',
      questionTextCn: '叶背是否先出现水渍样小疱点或鼓包？',
      questionTextUserCn: '叶背先出现水渍样小疱点或鼓包吗？',
      questionGroupKey: 'edema_group',
      questionLevel: 1,
      observability: 'medium',
      priority: 96,
      helpTextCn: '重点翻看叶背和叶脉之间，确认是组织自己鼓起，而不是虫卵、介壳或附着杂质。',
      whyThisQuestionCn: '叶背的水渍样小疱点是 oedema 的核心入口征象，先确认它能把路径收向生理性过水障碍。',
      sourceKeys: ['edemaWater'],
      problemKeys: ['edema', 'overwatering'],
      strategyBase: 96,
      engineRuleKey: 'eg_edema_blisters',
      engineGroup: 'edema_group'
    }
  },
  {
    symptomKey: 'edema',
    displayTextCn: '水肿',
    closureMode: 'single',
    category: 'edema',
    confirm: {
      questionKey: 'q_edema_warty',
      targetSymptomKey: 'edema',
      questionTextCn: '这些鼓包是否后期变成木栓化、粗糙或锈色斑？',
      questionTextUserCn: '这些鼓包后期会变成木栓化、粗糙或锈色斑吗？',
      questionGroupKey: 'edema_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 90,
      helpTextCn: '若鼓包后期变成粗糙疣状或锈色木栓斑，更支持 oedema，而不是短期机械伤或虫害附着。',
      whyThisQuestionCn: '这道题把早期鼓包和后期木栓化连接成同一条生理性水肿证据链。',
      sourceKeys: ['edemaWater'],
      problemKeys: ['edema', 'overwatering'],
      strategyBase: 90,
      engineRuleKey: 'eg_edema_warty',
      engineGroup: 'edema_group'
    }
  },
  {
    symptomKey: 'leaf_yellowing',
    displayTextCn: '叶子明显发黄',
    closureMode: 'double',
    category: 'yellowing_split',
    confirm: {
      questionKey: 'q_leaf_yellowing_confirm',
      targetSymptomKey: 'leaf_yellowing',
      questionTextCn: '植株是否存在比较明确的发黄叶片，而不是轻微失绿或光照反光？',
      questionTextUserCn: '植株有比较明确的发黄叶片，而不是轻微失绿或反光吗？',
      questionGroupKey: 'leaf_yellowing_group',
      questionLevel: 1,
      observability: 'medium',
      priority: 78,
      helpTextCn: '先排除拍摄曝光和逆光影响，确认是真实的黄化，而不是颜色偏浅或局部反光。',
      whyThisQuestionCn: '黄化是强结果态，但不是单一病因；先确认“真黄”成立，后续分流才有意义。',
      sourceKeys: ['chlorosis'],
      problemKeys: ['overwatering', 'underwatering', 'edema', 'rust', 'virus_mosaic', 'aphids', 'whiteflies', 'scale_insects'],
      strategyBase: 78,
      engineRuleKey: 'eg_leaf_yellowing_confirm',
      engineGroup: 'leaf_yellowing_group'
    },
    context: {
      questionKey: 'q_leaf_yellowing_new_growth_bias',
      targetSymptomKey: 'yellow_new_leaves',
      questionTextCn: '发黄是否主要出现在新叶，而老叶相对更绿？',
      questionTextUserCn: '发黄主要出现在新叶，而老叶相对更绿吗？',
      questionGroupKey: 'leaf_yellowing_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 72,
      helpTextCn: '区分新叶黄还是老叶黄，能显著提高黄化路径的信息增益，避免把所有黄叶都混成同一种问题。',
      whyThisQuestionCn: '黄化的关键不是“黄没黄”，而是分布模式；这题用于把黄化继续分到更有价值的子路径。',
      sourceKeys: ['chlorosis'],
      problemKeys: ['overwatering', 'underwatering', 'edema', 'virus_mosaic'],
      strategyBase: 72,
      engineRuleKey: 'eg_leaf_yellowing_new_growth_bias',
      engineGroup: 'leaf_yellowing_group'
    }
  }
]

module.exports = {
  metadata,
  sourceSets,
  closures
}
