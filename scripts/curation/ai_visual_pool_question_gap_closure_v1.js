'use strict'

const metadata = {
  envId: 'cloud1-2grufevs395a9d5e',
  batchId: 'batch_20260413_ai_visual_pool_gap_closure',
  versionTag: 'v20260413_ai_visual_gap_q_v1',
  auditDate: '2026-04-13',
  publishedAt: '2026-04-13 12:00:00',
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
      '正式题库以 data_status=audited 为发布态，review_status=audited 表示已完成权威来源人工核验。',
    engineTable:
      'question_generation_engine 当前无 data_status 字段，且暂不属于 diagnose-http 正式运行时读链；本次以 review_status=audited + source-backed review_note 表达 audited 生成资产/审计登记语义。'
  }
}

const sourceSets = {
  blackMold: [
    'https://www.rhs.org.uk/biodiversity/soft-scale',
    'https://apps.extension.umn.edu/garden/diagnose/plant/evergreen/pine/shootsblack.html'
  ],
  rotAndCollapse: [
    'https://extension.usu.edu/vegetableguide/sweet-corn/bacterial-soft-rot.php',
    'https://apps.extension.umn.edu/garden/diagnose/plant/annualperennial/impatiens/plantstunted.html',
    'https://www.rhs.org.uk/prevention-protection/leaf-damage-on-houseplants'
  ],
  chewing: [
    'https://www.rhs.org.uk/biodiversity/slugs-and-snails',
    'https://ipm.ucanr.edu/PMG/GARDEN/PLANTS/INVERT/leafbeetle.html',
    'https://ipm.ucanr.edu/PMG/GARDEN/FRUIT/PESTS/wesgrskeleton.html'
  ],
  leafMiner: ['https://www.rhs.org.uk/biodiversity/chrysanthemum-leaf-miner'],
  scorchAndStress: [
    'https://www.rhs.org.uk/prevention-protection/leaf-damage-on-houseplants',
    'https://www.rhs.org.uk/prevention-protection/wind-scorch',
    'https://www.rhs.org.uk/problems/acer-leaf-scorch',
    'https://www.rhs.org.uk/plants/types/houseplants/how-to-help-a-poorly-houseplant'
  ],
  budStress: [
    'https://www.rhs.org.uk/plants/begonias/houseplants',
    'https://www.rhs.org.uk/advice/understanding-plants/how-plants-lose-water',
    'https://www.rhs.org.uk/plants/types/houseplants/how-to-help-a-poorly-houseplant'
  ],
  mosaicAndTwist: [
    'https://www.rhs.org.uk/disease/tomato-viruses',
    'https://ipm.ucanr.edu/agriculture/celery/celery-mosaic-virus/'
  ],
  yellowPatchy: [
    'https://apps.extension.umn.edu/garden/diagnose/plant/annualperennial/marigold/leavesdiscoloredpale.html',
    'https://www.rhs.org.uk/prevention-protection/leaf-damage-on-houseplants'
  ]
}

const closures = [
  {
    symptomKey: 'black_mold_growth',
    displayTextCn: '黑霉层',
    closureMode: 'single',
    category: 'direct_confirm',
    confirm: {
      questionKey: 'q_black_mold_growth_confirm',
      targetSymptomKey: 'black_mold_growth',
      questionTextCn: '叶片或茎面是否覆有一层黑褐色、像煤烟一样的霉层？',
      questionTextUserCn: '叶片或茎面有黑褐色、像煤烟一样的霉层吗？',
      questionGroupKey: 'black_mold_growth_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 96,
      helpTextCn:
        '优先看叶面、叶背、叶柄和有黏感的部位，确认黑层是附着在表面的覆盖层，而不是叶片自身发黑。',
      whyThisQuestionCn:
        'RHS 与 UMN 都把 honeydew 上形成的 sooty mould 视为高特异可见征象，先确认黑霉层是否真实存在能快速收紧虫害方向。',
      sourceKeys: ['blackMold'],
      problemKeys: ['sooty_mold_associated_pests', 'aphids', 'scale_insects'],
      strategyBase: 96,
      engineRuleKey: 'eg_black_mold_growth_confirm',
      engineGroup: 'ai_visual_pool_direct_confirm'
    }
  },
  {
    symptomKey: 'blackened_stem_base',
    displayTextCn: '茎基部变黑',
    closureMode: 'double',
    category: 'rot_split',
    confirm: {
      questionKey: 'q_blackened_stem_base_confirm',
      targetSymptomKey: 'blackened_stem_base',
      questionTextCn: '靠近土面的茎基部是否明显发黑、发暗或收缩？',
      questionTextUserCn: '靠近土面的茎基部有明显发黑、发暗吗？',
      questionGroupKey: 'blackened_stem_base_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 98,
      helpTextCn: '重点看土面以上 1 到 3 厘米的茎基部，确认是否出现湿黑、发暗或干缩带。',
      whyThisQuestionCn:
        '茎基部变黑在根腐、细菌性腐烂和根颈腐中都具有较高辨识度，应先确认这个可见征象是否成立。',
      sourceKeys: ['rotAndCollapse'],
      problemKeys: ['root_rot', 'bacterial_rot', 'crown_rot'],
      strategyBase: 98,
      engineRuleKey: 'eg_blackened_stem_base_confirm',
      engineGroup: 'ai_visual_pool_rot_confirm'
    },
    context: {
      questionKey: 'q_blackened_stem_base_bad_root_smell',
      targetSymptomKey: 'bad_root_smell',
      questionTextCn: '发黑部位附近是否伴随闷臭、烂味或明显腐败气味？',
      questionTextUserCn: '茎基部发黑时，附近有闷臭或烂味吗？',
      questionGroupKey: 'blackened_stem_base_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 84,
      helpTextCn: '轻闻土面和茎基部附近。若有闷臭或烂味，更支持腐烂型路径，而不是单纯机械伤或干缩。',
      whyThisQuestionCn:
        '权威资料把腐烂异味作为 rot 类问题的重要分流信号，用来把基部发黑进一步分到腐烂链路而非单纯表皮伤害。',
      sourceKeys: ['rotAndCollapse'],
      problemKeys: ['root_rot', 'bacterial_rot', 'crown_rot'],
      strategyBase: 84,
      engineRuleKey: 'eg_blackened_stem_base_bad_root_smell',
      engineGroup: 'ai_visual_pool_rot_context'
    }
  },
  {
    symptomKey: 'bud_drop',
    displayTextCn: '掉花苞',
    closureMode: 'double',
    category: 'bud_stress_split',
    confirm: {
      questionKey: 'q_bud_drop_confirm',
      targetSymptomKey: 'bud_drop',
      questionTextCn: '花苞是否在打开前就发黄、干缩或直接脱落？',
      questionTextUserCn: '花苞是在打开前就发黄、干缩或掉下来吗？',
      questionGroupKey: 'bud_drop_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 90,
      helpTextCn: '回看最近掉落的花苞，确认它们是不是在正常开放前就提前停止发育并掉落。',
      whyThisQuestionCn:
        'bud drop 本身要先和正常谢花区分开，确认“未开先落”成立后，环境应激分流才有意义。',
      sourceKeys: ['budStress'],
      problemKeys: ['environmental_stress', 'low_humidity_stress', 'underwatering'],
      strategyBase: 90,
      engineRuleKey: 'eg_bud_drop_confirm',
      engineGroup: 'ai_visual_pool_bud_confirm'
    },
    context: {
      questionKey: 'q_bud_drop_low_humidity_damage',
      targetSymptomKey: 'low_humidity_damage',
      questionTextCn: '掉苞前是否同时出现空气偏干、叶缘干尖或靠近风口后更明显？',
      questionTextUserCn: '掉苞前，空气偏干、叶缘干尖或靠近风口后会更明显吗？',
      questionGroupKey: 'bud_drop_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 80,
      helpTextCn: '回想最近是否有空调、暖气、风口、低湿环境或浇水忽干忽湿，这些更支持环境应激路径。',
      whyThisQuestionCn:
        'RHS 对 bud drop 与 dry air、under-watering、环境波动的关联很明确，这条题用于把掉苞拉回环境/养护分流而不是误判病虫。',
      sourceKeys: ['budStress'],
      problemKeys: ['environmental_stress', 'low_humidity_stress', 'underwatering'],
      strategyBase: 80,
      engineRuleKey: 'eg_bud_drop_low_humidity_damage',
      engineGroup: 'ai_visual_pool_bud_context'
    }
  },
  {
    symptomKey: 'chewed_edges',
    displayTextCn: '叶子边缘像被啃过',
    closureMode: 'single',
    category: 'chewing_confirm',
    confirm: {
      questionKey: 'q_chewed_edges_confirm',
      targetSymptomKey: 'chewed_edges',
      questionTextCn: '叶缘是否呈一口一口被啃掉的缺口，而不是整齐焦边或病斑坏死？',
      questionTextUserCn: '叶缘像被一口一口啃掉，而不是焦边或病斑吗？',
      questionGroupKey: 'chewed_edges_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 94,
      helpTextCn: '重点看缺口边缘是否是真实被咬掉的组织，而不是干焦、卷曲或坏死后残留下来的边缘。',
      whyThisQuestionCn:
        'UC IPM 与 RHS 都把不规则啃食缺口视为 chewing pests 的典型入口信号，需要先把它与焦边或病斑坏死区分开。',
      sourceKeys: ['chewing'],
      problemKeys: ['caterpillars', 'chewing_insects', 'snails_slugs', 'beetles'],
      strategyBase: 94,
      engineRuleKey: 'eg_chewed_edges_confirm',
      engineGroup: 'ai_visual_pool_chewing_confirm'
    }
  },
  {
    symptomKey: 'flower_abort',
    displayTextCn: '花发育失败',
    closureMode: 'double',
    category: 'bud_stress_split',
    confirm: {
      questionKey: 'q_flower_abort_confirm',
      targetSymptomKey: 'flower_abort',
      questionTextCn: '花朵是否没有正常展开就萎缩、发褐或中途停止发育？',
      questionTextUserCn: '花朵是在没正常打开前就萎缩、发褐或停住了吗？',
      questionGroupKey: 'flower_abort_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 88,
      helpTextCn: '确认异常花朵是不是在发育中途停住，而不是开败后的正常衰老。',
      whyThisQuestionCn:
        'flower abort 需要先和自然谢花分开，确认“中途停育”后，再看是否由环境应激触发。',
      sourceKeys: ['budStress'],
      problemKeys: ['environmental_stress', 'heat_stress', 'underwatering'],
      strategyBase: 88,
      engineRuleKey: 'eg_flower_abort_confirm',
      engineGroup: 'ai_visual_pool_bud_confirm'
    },
    context: {
      questionKey: 'q_flower_abort_low_humidity_damage',
      targetSymptomKey: 'low_humidity_damage',
      questionTextCn: '花发育失败前是否伴随干风、低湿、温差大或浇水忽干忽湿？',
      questionTextUserCn: '花发育失败前，是否有干风、低湿、温差大或浇水忽干忽湿？',
      questionGroupKey: 'flower_abort_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 78,
      helpTextCn: '回想最近的空气湿度、温度波动和浇水稳定性。环境应激型失败常伴这些变化。',
      whyThisQuestionCn:
        '权威资料把花器中途停育和空气干燥、温差、浇水波动关联在一起，这题用于把花发育失败导向环境/养护分流。',
      sourceKeys: ['budStress'],
      problemKeys: ['environmental_stress', 'heat_stress', 'underwatering'],
      strategyBase: 78,
      engineRuleKey: 'eg_flower_abort_low_humidity_damage',
      engineGroup: 'ai_visual_pool_bud_context'
    }
  },
  {
    symptomKey: 'holes_in_leaf',
    displayTextCn: '叶子被咬出了洞',
    closureMode: 'single',
    category: 'chewing_confirm',
    confirm: {
      questionKey: 'q_holes_in_leaf_confirm',
      targetSymptomKey: 'holes_in_leaf',
      questionTextCn: '叶片上是否有被咬穿的洞口，而不是病斑干掉后形成的穿孔？',
      questionTextUserCn: '叶片上有被咬穿的洞，而不是病斑干掉后的穿孔吗？',
      questionGroupKey: 'holes_in_leaf_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 94,
      helpTextCn: '看洞缘是否是直接缺了一块组织，尤其留意是否伴随银色黏液痕或啃食边缘。',
      whyThisQuestionCn:
        'UC IPM 对 snails/slugs 与 chewing insects 的描述都强调“真洞口”特征，这题用于把虫咬洞和病理穿孔分开。',
      sourceKeys: ['chewing'],
      problemKeys: ['snails_slugs', 'caterpillars', 'chewing_insects', 'beetles'],
      strategyBase: 94,
      engineRuleKey: 'eg_holes_in_leaf_confirm',
      engineGroup: 'ai_visual_pool_chewing_confirm'
    }
  },
  {
    symptomKey: 'leaf_bleaching',
    displayTextCn: '叶片漂白',
    closureMode: 'double',
    category: 'scorch_split',
    confirm: {
      questionKey: 'q_leaf_bleaching_confirm',
      targetSymptomKey: 'leaf_bleaching',
      questionTextCn: '叶片是否出现发白、褪色甚至漂白的区域？',
      questionTextUserCn: '叶片有发白、褪色甚至漂白的区域吗？',
      questionGroupKey: 'leaf_bleaching_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 92,
      helpTextCn: '重点看颜色是否是真正褪白，而不是单纯发黄；同时注意是否集中在受光更强的表面。',
      whyThisQuestionCn:
        'RHS 明确把过强光照与 pale/bleached patches 联系起来，先确认漂白区存在，再问是否符合晒伤分布。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['sunburn'],
      strategyBase: 92,
      engineRuleKey: 'eg_leaf_bleaching_confirm',
      engineGroup: 'ai_visual_pool_scorch_confirm'
    },
    context: {
      questionKey: 'q_leaf_bleaching_sunburn_patch',
      targetSymptomKey: 'sunburn_patch',
      questionTextCn: '这些发白区是否主要出现在受光最强的一面，或在暴晒后更明显？',
      questionTextUserCn: '这些发白区主要在最晒的一面，或暴晒后更明显吗？',
      questionGroupKey: 'leaf_bleaching_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 82,
      helpTextCn: '回看是否只在朝窗、朝阳或突然增强光照的一面更明显，这更支持 sun scorch 路径。',
      whyThisQuestionCn:
        '叶片漂白可由多种问题导致，但“集中在受光最强一面”是晒伤路径的重要上下文分流条件。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['sunburn'],
      strategyBase: 82,
      engineRuleKey: 'eg_leaf_bleaching_sunburn_patch',
      engineGroup: 'ai_visual_pool_scorch_context'
    }
  },
  {
    symptomKey: 'leaf_margin_burn',
    displayTextCn: '叶缘灼伤',
    closureMode: 'double',
    category: 'scorch_split',
    confirm: {
      questionKey: 'q_leaf_margin_burn_confirm',
      targetSymptomKey: 'leaf_margin_burn',
      questionTextCn: '叶缘或叶尖是否先发黄后焦褐，像被灼过一样？',
      questionTextUserCn: '叶缘或叶尖先发黄后焦褐，像被灼过一样吗？',
      questionGroupKey: 'leaf_margin_burn_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 92,
      helpTextCn: '观察叶缘变化是否连续分布在边缘/尖端，而不是零散圆斑或咬痕。',
      whyThisQuestionCn:
        'RHS 对 scorch 与 dry-air injury 的描述都把 tips/margins browning 作为核心可见征象，适合作为第一道确认题。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['salt_stress', 'sunburn', 'low_humidity_stress'],
      strategyBase: 92,
      engineRuleKey: 'eg_leaf_margin_burn_confirm',
      engineGroup: 'ai_visual_pool_scorch_confirm'
    },
    context: {
      questionKey: 'q_leaf_margin_burn_crispy_edges',
      targetSymptomKey: 'crispy_edges',
      questionTextCn: '这些焦边是否干脆易碎，并在空气偏干、热或缺水时更明显？',
      questionTextUserCn: '这些焦边会干脆易碎，并在空气偏干、热或缺水时更明显吗？',
      questionGroupKey: 'leaf_margin_burn_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 82,
      helpTextCn: '轻摸焦边是否纸质、发脆；若同时伴低湿、热风或浇水不足，更支持环境/失水路径。',
      whyThisQuestionCn:
        '把“烧边”与“脆边”配对，能把低湿/失水/盐害方向和真正的病斑坏死更有效地区分开。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['salt_stress', 'sunburn', 'low_humidity_stress'],
      strategyBase: 82,
      engineRuleKey: 'eg_leaf_margin_burn_crispy_edges',
      engineGroup: 'ai_visual_pool_scorch_context'
    }
  },
  {
    symptomKey: 'leaf_margin_necrosis',
    displayTextCn: '叶缘坏死',
    closureMode: 'double',
    category: 'necrosis_split',
    confirm: {
      questionKey: 'q_leaf_margin_necrosis_confirm',
      targetSymptomKey: 'leaf_margin_necrosis',
      questionTextCn: '叶缘是否已经形成连续的褐黑坏死带？',
      questionTextUserCn: '叶缘已经形成连续的褐黑坏死带了吗？',
      questionGroupKey: 'leaf_margin_necrosis_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 90,
      helpTextCn: '确认坏死带是否沿叶缘连续分布，而不是少量零散病斑或被虫咬缺口。',
      whyThisQuestionCn:
        '边缘坏死既可能是 abiotic scorch，也可能是病理性边缘病斑，因此第一步先确认“连续坏死带”这一外观是否成立。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['salt_stress', 'black_rot', 'sunburn', 'bacterial_leaf_spot'],
      strategyBase: 90,
      engineRuleKey: 'eg_leaf_margin_necrosis_confirm',
      engineGroup: 'ai_visual_pool_necrosis_confirm'
    },
    context: {
      questionKey: 'q_leaf_margin_necrosis_v_shaped_lesions',
      targetSymptomKey: 'v_shaped_lesions',
      questionTextCn: '坏死边缘内侧是否还能看到黄边或 V 形向叶片内延伸的病斑？',
      questionTextUserCn: '坏死边缘内侧还能看到黄边或 V 形往叶片里走的病斑吗？',
      questionGroupKey: 'leaf_margin_necrosis_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 78,
      helpTextCn: '如果边缘坏死内侧还出现黄边或 V 形推进，病理性叶缘病斑的可能性会高于单纯烧边。',
      whyThisQuestionCn:
        '权威资料常把黄晕、V 形推进或边缘向内扩展作为病理性叶缘病斑的重要提示，这题用于把病理和环境烧边分开。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['black_rot', 'bacterial_leaf_spot', 'salt_stress', 'sunburn'],
      strategyBase: 78,
      engineRuleKey: 'eg_leaf_margin_necrosis_v_shaped_lesions',
      engineGroup: 'ai_visual_pool_necrosis_context'
    }
  },
  {
    symptomKey: 'leaf_mosaic_mottling',
    displayTextCn: '叶子上有深浅不一、花花绿绿的斑驳花纹',
    closureMode: 'double',
    category: 'mosaic_split',
    confirm: {
      questionKey: 'q_leaf_mosaic_mottling_confirm',
      targetSymptomKey: 'leaf_mosaic_mottling',
      questionTextCn: '叶片上是否有深浅不一、块状交错的斑驳花叶，而不是单纯均匀退色？',
      questionTextUserCn: '叶片上有深浅不一、块状交错的斑驳花叶吗？',
      questionGroupKey: 'leaf_mosaic_mottling_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 96,
      helpTextCn: '重点分辨这是不是“花叶斑驳”，而不是整片一起黄、白或褐。',
      whyThisQuestionCn:
        'RHS 与 UC IPM 都把 mosaic/mottling 视为病毒路径的核心外观信号，应先把斑驳花叶本体确认下来。',
      sourceKeys: ['mosaicAndTwist'],
      problemKeys: ['virus_mosaic'],
      strategyBase: 96,
      engineRuleKey: 'eg_leaf_mosaic_mottling_confirm',
      engineGroup: 'ai_visual_pool_mosaic_confirm'
    },
    context: {
      questionKey: 'q_leaf_mosaic_mottling_distorted_growth',
      targetSymptomKey: 'distorted_growth',
      questionTextCn: '这种斑驳是否同时伴随新叶畸形、缩小或整株生长异常？',
      questionTextUserCn: '这种斑驳还伴随新叶畸形、缩小或整株长势异常吗？',
      questionGroupKey: 'leaf_mosaic_mottling_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 86,
      helpTextCn: '若斑驳与畸形、新叶异常一起出现，更支持病毒性花叶，而不是单纯光照或养分问题。',
      whyThisQuestionCn:
        '病毒型花叶常同时伴随 distorted growth，这道题用于把稳定的病毒花叶路径和单纯色变分开。',
      sourceKeys: ['mosaicAndTwist'],
      problemKeys: ['virus_mosaic'],
      strategyBase: 86,
      engineRuleKey: 'eg_leaf_mosaic_mottling_distorted_growth',
      engineGroup: 'ai_visual_pool_mosaic_context'
    }
  },
  {
    symptomKey: 'leaf_twist',
    displayTextCn: '叶片扭曲',
    closureMode: 'double',
    category: 'mosaic_split',
    confirm: {
      questionKey: 'q_leaf_twist_confirm',
      targetSymptomKey: 'leaf_twist',
      questionTextCn: '叶片是否明显扭曲、翻卷或展开方向异常？',
      questionTextUserCn: '叶片明显扭曲、翻卷或展开方向异常吗？',
      questionGroupKey: 'leaf_twist_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 88,
      helpTextCn: '确认扭曲是否是叶片自身展开异常，而不是单纯缺水后暂时卷曲。',
      whyThisQuestionCn:
        'leaf twist 本身并不等同于病毒，但在病毒、药害和虫害分流中价值很高，先确认叶片是否真的扭曲。',
      sourceKeys: ['mosaicAndTwist'],
      problemKeys: ['virus_mosaic'],
      strategyBase: 88,
      engineRuleKey: 'eg_leaf_twist_confirm',
      engineGroup: 'ai_visual_pool_mosaic_confirm'
    },
    context: {
      questionKey: 'q_leaf_twist_distorted_new_growth',
      targetSymptomKey: 'distorted_new_growth',
      questionTextCn: '扭曲是否主要发生在新叶或嫩梢，并伴随展开不正常？',
      questionTextUserCn: '扭曲主要发生在新叶或嫩梢，而且展开不正常吗？',
      questionGroupKey: 'leaf_twist_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 80,
      helpTextCn: '如果扭曲集中在新叶、嫩梢并伴随展开不正常，会更支持系统性异常而非单片叶的局部损伤。',
      whyThisQuestionCn:
        '把 leaf twist 与 distorted new growth 联合确认，能明显提高对病毒型生长异常的辨识度。',
      sourceKeys: ['mosaicAndTwist'],
      problemKeys: ['virus_mosaic'],
      strategyBase: 80,
      engineRuleKey: 'eg_leaf_twist_distorted_new_growth',
      engineGroup: 'ai_visual_pool_mosaic_context'
    }
  },
  {
    symptomKey: 'skeletonized_leaves',
    displayTextCn: '叶子被吃得只剩叶脉骨架',
    closureMode: 'single',
    category: 'chewing_confirm',
    confirm: {
      questionKey: 'q_skeletonized_leaves_confirm',
      targetSymptomKey: 'skeletonized_leaves',
      questionTextCn: '叶片是否被吃到只剩叶脉骨架或半透明网状残留？',
      questionTextUserCn: '叶片被吃到只剩叶脉骨架或半透明网状残留了吗？',
      questionGroupKey: 'skeletonized_leaves_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 98,
      helpTextCn: '看是否是叶肉被刮掉、只剩叶脉或半透明残膜，而不是整片褐化后干枯。',
      whyThisQuestionCn:
        'UC IPM 与 RHS 对 skeletonizer/leaf beetle 的描述都把“只剩叶脉骨架”视为高特异虫食信号，这题适合单题确认。',
      sourceKeys: ['chewing'],
      problemKeys: ['chewing_insects', 'beetles'],
      strategyBase: 98,
      engineRuleKey: 'eg_skeletonized_leaves_confirm',
      engineGroup: 'ai_visual_pool_chewing_confirm'
    }
  },
  {
    symptomKey: 'soft_stem',
    displayTextCn: '茎变软',
    closureMode: 'double',
    category: 'rot_split',
    confirm: {
      questionKey: 'q_soft_stem_confirm',
      targetSymptomKey: 'soft_stem',
      questionTextCn: '茎部是否摸起来发软、塌陷或失去支撑感？',
      questionTextUserCn: '茎部摸起来发软、塌陷或没支撑感吗？',
      questionGroupKey: 'soft_stem_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 94,
      helpTextCn: '轻捏茎部异常位置，确认是组织本身变软，而不是单纯叶片下垂造成的视觉错觉。',
      whyThisQuestionCn:
        '茎变软是 soft rot、bacterial rot 与 root rot 相关问题的重要入口信号，必须先确认这个本体症状。',
      sourceKeys: ['rotAndCollapse'],
      problemKeys: ['soft_rot', 'root_rot', 'bacterial_rot'],
      strategyBase: 94,
      engineRuleKey: 'eg_soft_stem_confirm',
      engineGroup: 'ai_visual_pool_rot_confirm'
    },
    context: {
      questionKey: 'q_soft_stem_mushy_tissue',
      targetSymptomKey: 'mushy_tissue',
      questionTextCn: '发软部位按压后是否湿滑、糊状或有要化水的感觉？',
      questionTextUserCn: '发软部位按压后会湿滑、糊状，像要化水吗？',
      questionGroupKey: 'soft_stem_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 82,
      helpTextCn: '若组织已经湿滑、糊状或塌成糊，腐烂型问题的可能性明显高于失水型萎软。',
      whyThisQuestionCn:
        '软而湿滑的 tissue breakdown 是腐烂链路的重要分流信号，这题用来把“软”进一步分到“烂”。',
      sourceKeys: ['rotAndCollapse'],
      problemKeys: ['soft_rot', 'bacterial_rot', 'root_rot'],
      strategyBase: 82,
      engineRuleKey: 'eg_soft_stem_mushy_tissue',
      engineGroup: 'ai_visual_pool_rot_context'
    }
  },
  {
    symptomKey: 'stem_collapse',
    displayTextCn: '茎塌陷',
    closureMode: 'double',
    category: 'rot_split',
    confirm: {
      questionKey: 'q_stem_collapse_confirm',
      targetSymptomKey: 'stem_collapse',
      questionTextCn: '茎是否出现折腰、塌陷或整段支撑不住的情况？',
      questionTextUserCn: '茎出现折腰、塌陷或整段支撑不住了吗？',
      questionGroupKey: 'stem_collapse_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 92,
      helpTextCn: '确认是茎本身失去支撑，而不是单纯上部叶片重或缺水后暂时下垂。',
      whyThisQuestionCn:
        'stem collapse 在 rot 类问题中信息增益很高，但需要先确认是茎支撑结构失效，而不是普通萎蔫。',
      sourceKeys: ['rotAndCollapse'],
      problemKeys: ['soft_rot', 'root_rot', 'crown_rot'],
      strategyBase: 92,
      engineRuleKey: 'eg_stem_collapse_confirm',
      engineGroup: 'ai_visual_pool_rot_confirm'
    },
    context: {
      questionKey: 'q_stem_collapse_poor_drainage',
      targetSymptomKey: 'poor_drainage',
      questionTextCn: '倒伏前盆土是否长期偏湿、浇水后很久都不干？',
      questionTextUserCn: '倒伏前盆土长期偏湿、浇水后很久都不干吗？',
      questionGroupKey: 'stem_collapse_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 80,
      helpTextCn: '长期湿土和排水不良更支持根腐/基腐路径，能把 stem collapse 从机械倒伏中分离出来。',
      whyThisQuestionCn:
        'RHS 与 extension 资料都把 wet soil / poor drainage 视为 rot 问题的重要背景条件，这题用于给 stem collapse 补背景分流。',
      sourceKeys: ['rotAndCollapse'],
      problemKeys: ['root_rot', 'soft_rot', 'crown_rot'],
      strategyBase: 80,
      engineRuleKey: 'eg_stem_collapse_poor_drainage',
      engineGroup: 'ai_visual_pool_rot_context'
    }
  },
  {
    symptomKey: 'tunnels_in_leaf',
    displayTextCn: '叶子里面有弯弯的白线',
    closureMode: 'single',
    category: 'leaf_miner_confirm',
    confirm: {
      questionKey: 'q_tunnels_in_leaf_confirm',
      targetSymptomKey: 'tunnels_in_leaf',
      questionTextCn: '叶片内部是否能看到弯弯曲曲、浅白色的潜道？',
      questionTextUserCn: '叶片内部能看到弯弯曲曲、浅白色的潜道吗？',
      questionGroupKey: 'tunnels_in_leaf_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 100,
      helpTextCn: '叶矿道通常埋在叶片组织内部，像白线一样蜿蜒延伸，不是表面划痕。',
      whyThisQuestionCn:
        'RHS 对 leaf miner 的描述把“叶内潜道”视为高特异可见征象，这个信号可以直接单题确认。',
      sourceKeys: ['leafMiner'],
      problemKeys: ['leaf_miners'],
      strategyBase: 100,
      engineRuleKey: 'eg_tunnels_in_leaf_confirm',
      engineGroup: 'ai_visual_pool_leaf_miner_confirm'
    }
  },
  {
    symptomKey: 'uniform_browning',
    displayTextCn: '整叶褐化',
    closureMode: 'double',
    category: 'scorch_split',
    confirm: {
      questionKey: 'q_uniform_browning_confirm',
      targetSymptomKey: 'uniform_browning',
      questionTextCn: '是否有整片叶子几乎一起变成褐色，而不是零散小斑点？',
      questionTextUserCn: '是整片叶子几乎一起变褐，而不是零散小斑点吗？',
      questionGroupKey: 'uniform_browning_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 88,
      helpTextCn: '看褐化是否覆盖整叶或大块区域，而不是几个病斑点逐渐扩展。',
      whyThisQuestionCn:
        'whole-leaf browning 更像 scorch / severe stress 一类表现，先把“整叶性”确认出来，再做环境分流。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['severe_stress', 'root_rot', 'sunburn'],
      strategyBase: 88,
      engineRuleKey: 'eg_uniform_browning_confirm',
      engineGroup: 'ai_visual_pool_scorch_confirm'
    },
    context: {
      questionKey: 'q_uniform_browning_crispy_edges',
      targetSymptomKey: 'crispy_edges',
      questionTextCn: '褐化叶片边缘是否同时干脆卷缩，像失水灼伤而不是局部病斑？',
      questionTextUserCn: '褐化叶片边缘会干脆卷缩，更像失水灼伤而不是局部病斑吗？',
      questionGroupKey: 'uniform_browning_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 78,
      helpTextCn: '如果整叶褐化伴边缘干脆卷缩，更支持 scorch / severe stress，而不是点状病理扩展。',
      whyThisQuestionCn:
        '把 uniform browning 与 crispy edges 绑定，能更稳地把 severe stress、sun scorch 与局部病斑区分开。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['severe_stress', 'sunburn', 'root_rot'],
      strategyBase: 78,
      engineRuleKey: 'eg_uniform_browning_crispy_edges',
      engineGroup: 'ai_visual_pool_scorch_context'
    }
  },
  {
    symptomKey: 'water_soaked_stem',
    displayTextCn: '水浸状茎',
    closureMode: 'single',
    category: 'rot_confirm',
    confirm: {
      questionKey: 'q_water_soaked_stem_confirm',
      targetSymptomKey: 'water_soaked_stem',
      questionTextCn: '茎部是否出现半透明、水浸样发暗区域？',
      questionTextUserCn: '茎部出现半透明、水浸样发暗区域了吗？',
      questionGroupKey: 'water_soaked_stem_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 96,
      helpTextCn: '水浸状区域常像被水泡透一样半透明发暗，与普通干枯或机械擦伤不同。',
      whyThisQuestionCn:
        'water-soaked tissue 是细菌性/软腐路径非常关键的可见信号，属于适合直接单题确认的高价值症状。',
      sourceKeys: ['rotAndCollapse'],
      problemKeys: ['bacterial_rot', 'soft_rot'],
      strategyBase: 96,
      engineRuleKey: 'eg_water_soaked_stem_confirm',
      engineGroup: 'ai_visual_pool_rot_confirm'
    }
  },
  {
    symptomKey: 'wind_damage',
    displayTextCn: '风伤',
    closureMode: 'double',
    category: 'scorch_split',
    confirm: {
      questionKey: 'q_wind_damage_confirm',
      targetSymptomKey: 'wind_damage',
      questionTextCn: '叶片是否有撕裂、擦伤，或仅在迎风侧更重的干焦损伤？',
      questionTextUserCn: '叶片有撕裂、擦伤，或只在迎风侧更重的干焦损伤吗？',
      questionGroupKey: 'wind_damage_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 86,
      helpTextCn: '重点看受损是否集中在迎风面，或同一侧叶片更干焦、发褐、被风打伤。',
      whyThisQuestionCn:
        'RHS wind scorch 明确指出迎风侧 desiccated edges / brown dry leaves 是关键外观，这题先确认风伤本体。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['mechanical_damage'],
      strategyBase: 86,
      engineRuleKey: 'eg_wind_damage_confirm',
      engineGroup: 'ai_visual_pool_wind_confirm'
    },
    context: {
      questionKey: 'q_wind_damage_crispy_edges',
      targetSymptomKey: 'crispy_edges',
      questionTextCn: '受损叶缘是否同时发干发脆，像被风持续抽干水分？',
      questionTextUserCn: '受损叶缘同时发干发脆，像被风一直抽干水分吗？',
      questionGroupKey: 'wind_damage_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 76,
      helpTextCn: '如果迎风侧同时出现干脆边缘和整片失水感，更符合 wind scorch 而不是单次机械擦伤。',
      whyThisQuestionCn:
        '风伤并不总是纯机械撕裂；加入 crispy edges 这一分流题，能更稳定地区分 wind scorch 与偶发擦伤。',
      sourceKeys: ['scorchAndStress'],
      problemKeys: ['mechanical_damage'],
      strategyBase: 76,
      engineRuleKey: 'eg_wind_damage_crispy_edges',
      engineGroup: 'ai_visual_pool_wind_context'
    }
  },
  {
    symptomKey: 'yellowing_patchy',
    displayTextCn: '局部黄化',
    closureMode: 'double',
    category: 'yellow_patchy_split',
    confirm: {
      questionKey: 'q_yellowing_patchy_confirm',
      targetSymptomKey: 'yellowing_patchy',
      questionTextCn: '叶片是否是局部块状发黄，而不是整叶一起均匀变黄？',
      questionTextUserCn: '叶片是局部块状发黄，而不是整叶一起均匀变黄吗？',
      questionGroupKey: 'yellowing_patchy_confirm_group',
      questionLevel: 1,
      observability: 'high',
      priority: 88,
      helpTextCn: '分辨黄化是集中在局部斑块、片区，还是整叶一起退色。局部黄化更适合作进一步分流。',
      whyThisQuestionCn:
        'patchy yellowing 同时连到病斑、螨害和缺素，先把“局部块状”确认下来，后面的分流才有意义。',
      sourceKeys: ['yellowPatchy'],
      problemKeys: ['fungal_leaf_spot', 'spider_mites', 'nutrient_deficiency'],
      strategyBase: 88,
      engineRuleKey: 'eg_yellowing_patchy_confirm',
      engineGroup: 'ai_visual_pool_yellow_patchy_confirm'
    },
    context: {
      questionKey: 'q_yellowing_patchy_yellow_speckling',
      targetSymptomKey: 'yellow_speckling',
      questionTextCn: '黄化区里是否还能看到密集细小失绿点或针刺样黄点？',
      questionTextUserCn: '黄化区里还能看到密集细小失绿点或针刺样黄点吗？',
      questionGroupKey: 'yellowing_patchy_context_group',
      questionLevel: 2,
      observability: 'medium',
      priority: 80,
      helpTextCn: '若黄区里是密集细点状失绿，需要优先考虑螨害；若只是片状泛黄，则更偏向其他方向。',
      whyThisQuestionCn:
        'UMN 对 spider mites 的描述把 stippling / yellow speckling 视为关键分流信号，这题用于把局部黄化导向更具体的虫害路径。',
      sourceKeys: ['yellowPatchy'],
      problemKeys: ['spider_mites', 'fungal_leaf_spot', 'nutrient_deficiency'],
      strategyBase: 80,
      engineRuleKey: 'eg_yellowing_patchy_yellow_speckling',
      engineGroup: 'ai_visual_pool_yellow_patchy_context'
    }
  }
]

module.exports = {
  metadata,
  sourceSets,
  closures
}
