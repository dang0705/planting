'use strict'

/**
 * 症状分类 & 追问问题 v2
 */

// 追问问题（7条，简化版）
const followUpQuestions = [
  {
    id: 'soil_moisture',
    category: 'care',
    question: '目前土壤湿度如何？',
    options: [
      { value: 'wet', label: '湿润/潮湿（手感明显潮）' },
      { value: 'normal', label: '微湿（适中）' },
      { value: 'dry', label: '干燥（土壤完全干透）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'watering_frequency',
    category: 'care',
    question: '最近浇水频率？',
    options: [
      { value: 'frequent', label: '频繁（每天或每隔1-2天）' },
      { value: 'normal', label: '适中（每周1-2次）' },
      { value: 'rare', label: '很少（超过2周才浇一次）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'light',
    category: 'environment',
    question: '植物所在的光照环境？',
    options: [
      { value: 'direct_strong', label: '强烈直射阳光（户外/朝南窗台）' },
      { value: 'bright_indirect', label: '明亮散射光（靠窗室内）' },
      { value: 'medium', label: '一般室内光线' },
      { value: 'low', label: '光线较暗（室内阴处）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'humidity',
    category: 'environment',
    question: '环境空气湿度？',
    options: [
      { value: 'high', label: '潮湿（梅雨季/浴室附近）' },
      { value: 'normal', label: '适中（一般室内）' },
      { value: 'low', label: '干燥（开空调/暖气）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'ventilation',
    category: 'environment',
    question: '通风情况如何？',
    options: [
      { value: 'poor', label: '通风差（密闭阳台/温室）' },
      { value: 'normal', label: '一般' },
      { value: 'good', label: '通风良好（户外或常开窗）' }
    ],
    triggerSymptoms: []
  },
  {
    id: 'fertilizer_recent',
    category: 'care',
    question: '最近是否施肥？',
    options: [
      { value: 'yes', label: '是，最近1-2个月内施过肥' },
      { value: 'no', label: '没有，超过3个月未施肥或从未施肥' }
    ],
    triggerSymptoms: ['yellow_leaves', 'pale_leaves', 'slow_growth', 'small_leaves']
  },
  {
    id: 'repot_recent',
    category: 'care',
    question: '最近 1-2 个月是否换过盆或大幅换土？',
    options: [
      { value: 'yes', label: '是，最近换过盆/换过大部分土' },
      { value: 'no', label: '没有，近期没有明显换盆换土' }
    ],
    triggerSymptoms: ['yellow_leaves', 'pale_leaves', 'slow_growth', 'small_leaves']
  },
  {
    id: 'temperature',
    category: 'environment',
    question: '近期环境温度更接近哪种情况？',
    options: [
      { value: 'cold', label: '偏冷，低温或昼夜温差大' },
      { value: 'normal', label: '基本适中稳定' },
      { value: 'hot', label: '偏热，闷热或暴晒后高温' }
    ],
    triggerSymptoms: ['wilting', 'brown_patches', 'leaf_drop', 'yellow_leaves', 'black_spots']
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
    triggerSymptoms: [
      'fine_webbing',
      'stippled_leaves',
      'visible_insects',
      'sticky_residue',
      'leaf_drop'
    ]
  }
]

module.exports = { followUpQuestions }
