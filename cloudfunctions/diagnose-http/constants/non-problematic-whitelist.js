'use strict'

module.exports = [
  {
    key: 'current_no_obvious_problem',
    problemKey: 'current_no_obvious_problem',
    label: '当前未见明显问题',
    finalDisplayName: '暂未见明显问题',
    requiredDirectionKeys: ['healthy_direction'],
    minimumDirectionConfidence: 0.75,
    requiresNoObservedSymptoms: true,
    requiresNoObservedEvidence: true,
    requiresNoDerivedEvidence: true,
    maxCompetingProblemDirectionConfidence: 0.18,
    summary: '当前图片里暂未见到足够稳定的问题性视觉证据，整体更像当前未见明显问题。若后续出现扩展、新发斑点、虫体、霉层或持续恶化，再重新诊断更稳妥。',
    explanation: {
      whyItHappens: '当前输入更像“暂未见明显问题”的状态，而不是已经形成稳定的问题性诊断对象。此结论来自非问题性方向信号领先，且没有正式问题性视觉证据进入事实层。',
      whatToCheckNext: '继续观察 3-7 天，看是否出现新发黄化、扩展性病斑、虫体、叶背异常、霉层或明显长势下滑。',
      firstAid: '维持当前养护稳定，不要因为一次诊断没有发现明显问题就突然猛改浇水、施肥或连续上药。',
      avoid: '不要把“暂未见明显问题”理解成永远无需观察；也不要在没有明确异常时过度处理。',
      reassurance: '这表示当前更像未见明显问题，而不是已经锁定某个病虫害或养护失衡。'
    },
    nextSteps: [
      '保持当前养护节奏，优先继续观察新叶、叶背和整体长势。',
      '若后续出现持续扩展或新的明确异常，再重新发起诊断。'
    ],
    whatToAvoid: [
      '不要因为一次图像诊断未见明显问题就立即上药或大幅调整浇水施肥。',
      '不要忽视后续新发异常；若出现扩展，再复查更稳妥。'
    ]
  },
  {
    key: 'normal_leaf_aging',
    problemKey: 'normal_leaf_aging',
    label: '正常老叶老化',
    requiredSymptomKeys: ['normal_leaf_aging_stable'],
    finalDisplayName: '暂未见明显问题',
    summary: '当前更像正常老叶老化。若黄化只集中在底部老叶，且新叶、生长点和整体长势正常，可先继续观察，不必按病害处理。',
    explanation: {
      whyItHappens: '部分植物会在生长过程中逐步淘汰底部老叶，这是常见的自然代谢现象，不等同于病虫害或严重养护失误。',
      whatToCheckNext: '重点看新叶、生长点和最近 3-7 天是否持续扩展；如果只限于少量老叶且没有继续蔓延，通常可先观察。',
      firstAid: '先移除已经完全枯黄的老叶，保持通风和稳定养护，不需要立刻上药或猛改浇水。',
      avoid: '不要因为少量底部老叶黄化就连续使用杀菌剂、杀虫剂，或一次性大幅调整浇水施肥。',
      reassurance: '当前更像正常老化信号，先观察新叶和扩展趋势通常更稳妥。'
    },
    nextSteps: [
      '先观察 3-7 天，确认黄化是否只停留在底部老叶。',
      '如果新叶、生长点和茎秆状态正常，优先维持当前养护节奏。'
    ],
    whatToAvoid: [
      '不要把少量底部老叶黄化直接当作病害或虫害处理。',
      '不要在证据不足时突然加大浇水、施肥或补药。'
    ]
  },
  {
    key: 'stable_natural_marking',
    problemKey: 'stable_natural_marking',
    questionProblemKey: 'stable_natural_marking',
    seedSymptomKeys: ['stable_natural_marking_pattern'],
    requiredSymptomKeys: [
      'stable_natural_marking_pattern',
      'stable_trait_new_growth_consistent',
      'stable_trait_no_recent_expansion'
    ],
    requiresIsolatedSeed: true,
    label: '稳定正常斑纹',
    finalDisplayName: '暂未见明显问题',
    summary: '当前更像稳定正常斑纹，暂不按病害处理。若这种花纹一直存在，新叶也保持类似，通常更像植物本身的稳定特征。',
    explanation: {
      whyItHappens: '有些植物会长期呈现稳定斑锦、固有花纹或色块差异。这类特征如果长期存在、新叶也类似，通常不属于病理性问题。',
      whatToCheckNext: '重点确认这些花纹是不是一直都有，新叶是否也保持类似表现，以及最近是否突然扩大、扭曲或伴随其他异常。',
      firstAid: '先不用急着上药或大改养护，优先保留对比照片并继续观察新叶与扩展趋势。',
      avoid: '不要把长期稳定、可重复出现的正常花纹直接当成病毒、蓟马或缺素去处理。',
      reassurance: '如果花纹长期稳定、整株长势也正常，通常更像固有正常特征；若后续快速扩展，再重新诊断更稳妥。'
    },
    nextSteps: [
      '先确认这些花纹是不是一直都有，尤其看新叶是否也保持类似表现。',
      '如果后续出现明显扩大、扭曲或伴随其他异常，再重新诊断。'
    ],
    whatToAvoid: [
      '不要只因为看到斑驳就直接按病毒、蓟马或缺素处理。',
      '不要在缺少稳定性证据时把正常花纹和新发病斑混为一谈。'
    ]
  }
]
