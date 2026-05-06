export const diagnosisRules = [
  {
    id: 'root_rot',
    name: '根腐病',
    priority: 13,
    symptomsWeight: {
      yellow_leaves: 3,
      wilting: 2.5,
      dropping_leaves: 3,
      mold_on_soil: 5,
      black_spots: 4
    },
    negativeSymptoms: { dry_leaves: -3 },
    strongConditions: { soil_moisture: { wet: 4.5, dry: -8 } },
    interactionBoosts: [{ conditions: { humidity: 'high', ventilation: 'poor' }, boost: 4 }],
    mutuallyExclusiveWith: ['overwatering'],
    solutions: ['减少浇水', '改善通风', '清理烂根'],
    prevention: ['保持土壤微湿', '定期检查排水']
  },
  {
    id: 'overwatering',
    name: '浇水过多',
    priority: 10,
    symptomsWeight: { yellow_leaves: 2.5, wilting: 3, mold_on_soil: 5 },
    strongConditions: { soil_moisture: { wet: 4 } },
    mutuallyExclusiveWith: ['root_rot'],
    solutions: ['控制浇水', '检查盆底排水'],
    prevention: ['保持土壤湿度适中']
  },
  {
    id: 'spider_mites',
    name: '红蜘蛛',
    priority: 10,
    symptomsWeight: { leaf_curl: 4, fine_webbing: 5, yellow_speckles: 3 },
    negativeSymptoms: { powder_on_leaf: -7, mold_on_soil: -6 },
    strongConditions: { humidity: { low: 4, high: -5 } },
    interactionBoosts: [{ conditions: { temperature: 'hot', humidity: 'low' }, boost: 4 }],
    mutuallyExclusiveWith: ['powdery_mildew'],
    solutions: ['清理虫害', '喷洒杀虫剂'],
    prevention: ['保持湿度', '增加通风']
  }
]

export const questions = [
  {
    id: 'soil_moisture',
    question: '土壤湿度如何？',
    type: 'single',
    options: ['wet', 'normal', 'dry']
  },
  { id: 'humidity', question: '空气湿度？', type: 'single', options: ['low', 'medium', 'high'] },
  {
    id: 'temperature',
    question: '室温情况？',
    type: 'single',
    options: ['cool', 'normal', 'warm', 'hot']
  },
  { id: 'ventilation', question: '通风情况？', type: 'single', options: ['poor', 'medium', 'good'] }
]

export function diagnose(userSymptoms, userConditions) {
  const allConditions = { ...userConditions }
  let candidates = []

  for (const rule of diagnosisRules) {
    let symptomTotal = 0
    let conditionScore = 0

    const totalPossibleWeight = Object.values(rule.symptomsWeight || {}).reduce((a, b) => a + b, 0)
    userSymptoms.forEach(s => {
      symptomTotal += rule.symptomsWeight?.[s] || 0
    })
    const symptomScore = totalPossibleWeight > 0 ? symptomTotal / totalPossibleWeight : 0

    if (rule.negativeSymptoms) {
      userSymptoms.forEach(s => {
        conditionScore += rule.negativeSymptoms[s] || 0
      })
    }
    for (const [key, weightMap] of Object.entries(rule.strongConditions || {})) {
      conditionScore += weightMap?.[allConditions[key]] || 0
    }

    let finalScore = Math.max(0, Math.min(1, symptomScore * 0.65 + (conditionScore / 12) * 0.35))

    if (finalScore > 0.25) {
      candidates.push({ rule, score: finalScore, priorityAdjusted: finalScore * rule.priority })
    }
  }

  // 互斥规则处理
  candidates.sort((a, b) => b.priorityAdjusted - a.priorityAdjusted)
  for (let i = 0; i < candidates.length; i++) {
    const curr = candidates[i]
    for (let j = i + 1; j < candidates.length; j++) {
      if (curr.rule.mutuallyExclusiveWith?.includes(candidates[j].rule.id)) {
        candidates[j].score *= 0.3
        candidates[j].priorityAdjusted *= 0.3
      }
    }
  }
  candidates.sort((a, b) => b.priorityAdjusted - a.priorityAdjusted)
  return candidates.slice(0, 3)
}

const SYMPTOMS = {
  yellow_leaves: '叶片发黄',
  brown_tips: '叶尖发褐',
  leaf_spots: '叶片斑点',
  wilting: '叶片下垂',
  leaf_curl: '叶片卷曲',
  holes_in_leaves: '叶片虫洞',
  sticky_leaves: '叶片发粘',
  powder_on_leaf: '叶片白粉',
  black_spots: '黑色斑点',
  mold_on_soil: '土壤发霉',
  slow_growth: '生长缓慢',
  dropping_leaves: '掉叶'
}

const ENVIRONMENTAL_QUESTIONS = {
  soil_moisture: ['dry', 'normal', 'wet'],
  light: ['low', 'medium', 'direct'],
  watering_frequency: ['daily', 'weekly', 'rare'],
  recent_change: ['repot', 'moved', 'none']
}
