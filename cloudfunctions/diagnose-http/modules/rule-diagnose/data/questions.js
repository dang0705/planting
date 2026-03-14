'use strict'

/**
 * 症状分类 & 追问问题 v2
 */

// 症状分类（用于前端症状选择）
const symptomCategories = [
  {
    id: 'leaves',
    label: '叶片问题',
    symptoms: [
      { id: 'yellow_leaves',     label: '叶片发黄' },
      { id: 'pale_leaves',       label: '叶片褪色/苍白' },
      { id: 'brown_tips',        label: '叶尖/叶缘变褐' },
      { id: 'brown_patches',     label: '叶片褐色斑块' },
      { id: 'brown_spots',       label: '褐色圆形斑点' },
      { id: 'black_spots',       label: '黑色斑点' },
      { id: 'white_spots',       label: '白色斑点' },
      { id: 'white_powder',      label: '叶片有白色粉末' },
      { id: 'yellow_halo',       label: '斑点周围有黄晕' },
      { id: 'bleached_leaves',   label: '叶片褪白/漂白' },
      { id: 'soft_leaves',       label: '叶片软塌无力' },
      { id: 'dry_crispy_leaves', label: '叶片干燥/焦脆' },
      { id: 'leaf_curl',         label: '叶片卷曲' },
      { id: 'curled_leaves',     label: '叶片内卷' },
      { id: 'distorted_growth',  label: '叶片扭曲变形' },
      { id: 'stippled_leaves',   label: '叶片有细小点状失色' },
      { id: 'small_leaves',      label: '新叶偏小' },
      { id: 'leggy_growth',      label: '节间拉长/徒长' }
    ]
  },
  {
    id: 'plant_state',
    label: '整体状态',
    symptoms: [
      { id: 'wilting',       label: '植株萎蔫下垂' },
      { id: 'leaf_drop',     label: '叶片脱落' },
      { id: 'slow_growth',   label: '生长缓慢/停滞' },
      { id: 'brown_stems',   label: '茎干变褐/变软' },
      { id: 'root_smell',    label: '根部/土壤有臭味' }
    ]
  },
  {
    id: 'soil',
    label: '土壤/介质',
    symptoms: [
      { id: 'mold_on_soil',  label: '土壤表面有霉菌' },
      { id: 'small_flies',   label: '有小飞虫从土中飞出' }
    ]
  },
  {
    id: 'pests',
    label: '虫害迹象',
    symptoms: [
      { id: 'fine_webbing',    label: '叶片有细网丝（蜘蛛网状）' },
      { id: 'sticky_residue',  label: '叶片/茎有黏液' },
      { id: 'visible_insects', label: '可见小虫（蚜虫/粉虱等）' },
      { id: 'brown_bumps',     label: '茎叶有褐色硬突起（介壳）' },
      { id: 'sooty_mold',      label: '有黑色煤烟状霉层' }
    ]
  }
]

// 追问问题（7条，简化版）
const followUpQuestions = [
  {
    id: 'soil_moisture',
    category: 'care',
    question: '目前土壤湿度如何？',
    options: [
      { value: 'wet',    label: '湿润/潮湿（手感明显潮）' },
      { value: 'normal', label: '微湿（适中）' },
      { value: 'dry',    label: '干燥（土壤完全干透）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'watering_frequency',
    category: 'care',
    question: '最近浇水频率？',
    options: [
      { value: 'frequent', label: '频繁（每天或每隔1-2天）' },
      { value: 'normal',   label: '适中（每周1-2次）' },
      { value: 'rare',     label: '很少（超过2周才浇一次）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'light',
    category: 'environment',
    question: '植物所在的光照环境？',
    options: [
      { value: 'direct_strong',  label: '强烈直射阳光（户外/朝南窗台）' },
      { value: 'bright_indirect', label: '明亮散射光（靠窗室内）' },
      { value: 'medium',          label: '一般室内光线' },
      { value: 'low',             label: '光线较暗（室内阴处）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'humidity',
    category: 'environment',
    question: '环境空气湿度？',
    options: [
      { value: 'high',   label: '潮湿（梅雨季/浴室附近）' },
      { value: 'normal', label: '适中（一般室内）' },
      { value: 'low',    label: '干燥（开空调/暖气）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'ventilation',
    category: 'environment',
    question: '通风情况如何？',
    options: [
      { value: 'poor',   label: '通风差（密闭阳台/温室）' },
      { value: 'normal', label: '一般' },
      { value: 'good',   label: '通风良好（户外或常开窗）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'fertilizer_recent',
    category: 'care',
    question: '最近是否施肥？',
    options: [
      { value: 'yes', label: '是，最近1-2个月内施过肥' },
      { value: 'no',  label: '没有，超过3个月未施肥或从未施肥' }
    ],
    triggerSymptoms: ['yellow_leaves', 'pale_leaves', 'slow_growth', 'small_leaves']
  },
  {
    id: 'season',
    category: 'environment',
    question: '当前是什么季节？',
    options: [
      { value: 'spring', label: '春季（3-5月）' },
      { value: 'summer', label: '夏季（6-8月）' },
      { value: 'autumn', label: '秋季（9-11月）' },
      { value: 'winter', label: '冬季（12-2月）' }
    ],
    triggerSymptoms: ['fine_webbing', 'stippled_leaves', 'visible_insects', 'sticky_residue', 'leaf_drop']
  }
]

module.exports = { symptomCategories, followUpQuestions }