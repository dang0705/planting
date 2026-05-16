'use strict'

const {
  QUESTION_TARGET_DIMENSIONS,
  QUESTION_ROUTING_SCOPES
} = require('../question-target-dimension')
const { normalizeText } = require('./keys')
const { resolveNeutralSymptomLabel } = require('./templates')
const { isStructuralChewingSymptom } = require('./rules')

function buildOrthogonalProbeText(item = {}, targetDimension = '', _context = {}) {
  const symptomLabel = resolveNeutralSymptomLabel(item, '该异常')
  const locationKey = normalizeText(item?.locationKey)
  const patternKey = normalizeText(item?.patternKey)

  switch (targetDimension) {
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE:
      return {
        questionText: '叶子发黄的原因比较多，可能和最近的养护变化、虫子痕迹、病斑或环境变化有关。先选最明显的一类线索，后面就能少问无关问题。除了叶子发黄，你还注意到哪类情况最明显？',
        helpText: '这里只选最明显的一类线索；如果没有其他异常或看不准，可以选“只是发黄”或“不确定”。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE:
      return {
        questionText: '黄叶如果伴随斑点、烂斑或霉层，后续判断会完全不同。请先看发黄的位置，最接近下面哪一种？',
        helpText: '不需要区分真菌或细菌，只按肉眼能看到的斑点、湿软感、粉霉层来选。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN:
      return {
        questionText: '黄叶如果暂时没有明显虫痕、病斑或养护变化，就需要看它先从哪里开始。发黄主要先出现在新叶，还是老叶/下部叶？',
        helpText: '这题用于区分缺铁、缺氮、弱光和根部环境压力等方向，不是重复确认黄叶本身。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN:
      return {
        questionText: '黄叶的分布方式会影响后续方向。发黄的样子更接近哪一种？',
        helpText: '分布方式比“是否发黄”更能区分营养、光照、水分和虫害弱线索。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT:
      return {
        questionText: '黄叶和浇水有关时，重点不是“浇没浇”，而是最近实际浇水频率和盆土干湿。最近 2 周，你的浇水更接近哪一种？',
        helpText: '不需要先判断对错，只按实际频率和盆土干湿选择。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT:
      return {
        questionText: '黄叶和光照有关时，先看最近摆放位置和直射情况。最近 1-2 周，这盆植物更接近哪种光照？',
        helpText: '直接按全日光、散光、全阴或离窗远近选择；后端会结合这类植物的养护基线判断偏强或偏弱。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT:
      return {
        questionText: '黄叶和营养有关时，既可能是长期没补肥，也可能是近期重肥或换盆刺激。最近 1 个月，施肥情况更接近哪一种？',
        helpText: '用施肥次数和近期换盆/重肥记录营养背景，不直接把黄叶等同于缺肥。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED:
      return {
        questionText: '如果前面的线索还不够明确，黄叶变化速度能帮助判断是否存在根区或急性环境压力。发黄最近变化速度如何？',
        helpText: '变化速度和是否伴随萎蔫/掉叶，会影响是否需要进入根区或急性环境压力方向。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE:
      return {
        questionText: `这题是为了区分真实缺损更像虫害、病斑脱落，还是旧伤/摩擦，不是重复确认有没有洞。请看这些“${symptomLabel}”周围更像哪种情况？`,
        helpText: '这题不是确认有没有缺损，而是区分缺损更像虫害痕迹、病斑脱落，还是机械/旧伤。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE:
      return {
        questionText: '这题是为了确认有没有更直接的虫子活动线索，避免只凭黄点、缺口或斑驳就判断成虫害。这些痕迹旁边更接近哪种情况？',
        helpText: '这题用于区分红蜘蛛/螨类、蓟马、蜜露类刺吸害虫和非虫害痕迹，不把黄点或银斑直接当虫害。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE:
      return {
        questionText: '鼓包或水泡可能来自水肿、后期结痂，也可能只是普通斑点。先确认变化阶段，后面才能少问无关问题。这些鼓包或水泡更接近哪种变化？',
        helpText: '这题用于区分水肿样鼓包、后期木栓化结痂和普通斑点；还需要结合盆土湿度、光照和通风背景。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN:
      return {
        questionText: '线状痕迹需要先区分是不是叶片内部的“潜叶道”，否则容易和划痕、旧伤或反光混淆。这些线状痕迹更像叶片里面弯曲延伸的浅白隧道，还是表面的划痕、旧伤或反光？',
        helpText: '潜叶道通常像在叶肉内部延伸的弯曲浅色线，不等同于普通孔洞或表面划痕。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN:
      return {
        questionText: '白色粉层要先看是否在扩散，才能区分活跃粉层和较稳定的表面残留。这些白色粉层最近更像在叶面逐渐扩散，还是只停留在少数固定位置？',
        helpText: '这题不要求擦拭白粉，只追问分布和扩散方式，用来区分活跃粉层和不活跃表面异常。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS:
      return {
        questionText:
          locationKey === 'leaf'
            ? `这些“${symptomLabel}”的位置摸起来发黏吗？`
            : `这些“${symptomLabel}”的位置摸起来发黏吗？`,
        helpText: '只确认是否有黏感；干灰、脏层或黑灰附着通常不算发黏。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY:
      return {
        questionText: locationKey === 'leaf'
          ? `这些“${symptomLabel}”的位置是不是真的破了洞或缺了一块？`
          : `这些“${symptomLabel}”的位置有没有真的破损或缺了一块？`,
        helpText: '只确认是否真的破损或缺失；表面变色、斑点、焦边或旧伤痕迹不算真实缺口。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE:
      return {
        questionText: locationKey === 'leaf'
          ? `这些“${symptomLabel}”更像跟着叶片组织一起变化，还是只停留在表面一层？`
          : `这些“${symptomLabel}”更像附着在表面，还是组织本身变色？`,
        helpText: '只观察位置关系，不要求擦拭；如果视觉证据已经明确，系统会优先问其他病因分流题。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE:
      return {
        questionText: locationKey === 'stem'
          ? '异常部位按压时更像湿软发黏，还是更接近干瘪、塌陷或失去支撑？'
          : `异常附近组织更像干硬坏死，还是发软、带水渍感？`,
        helpText: '这一题用来区分“干硬坏死”与“湿软水浸”两种不同方向。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LESION_HALO:
      return {
        questionText: locationKey === 'leaf'
          ? '这些斑点周围是否还能看到一圈偏黄、发浅或像晕开的边缘？'
          : `这些“${symptomLabel}”周围是否还有一圈更浅色、像晕开的边缘？`,
        helpText: '这一题不是重复确认黑斑本身，而是追问是否伴随黄晕，这会影响叶斑问题的分流方向。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING:
      return {
        questionText: locationKey === 'leaf'
          ? '斑点边缘有没有像被水浸过一样，发暗、半透明或偏软？'
          : `这些“${symptomLabel}”边缘有没有像被水浸过一样，发暗、半透明或偏软？`,
        helpText: '这一题用来追问病斑边缘是否有水浸/湿软特征，帮助区分不同叶斑路径。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE:
      return {
        questionText: locationKey === 'leaf'
          ? `这类异常现在主要出现在少数叶片/局部，还是多片叶子、多个位置都能看到？`
          : '这种异常主要集中在局部，还是已经扩到更大范围？',
        helpText: '分布范围用于区分局部事件和全株性压力，不把局部损伤直接判成虫害。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE:
      return {
        questionText: isStructuralChewingSymptom(item)
          ? '翻看叶背、叶脉附近或盆土表面，能看到小虫、黑色颗粒、黏液痕或新鲜缺口吗？'
          : `翻看叶背、叶脉附近或更隐蔽的位置，这种“${symptomLabel}”在背面是否更明显？`,
        helpText: isStructuralChewingSymptom(item)
          ? '结构缺损本身不是虫害结论；这一题只追问是否有更直接的虫害线索。'
          : '很多叶部问题在叶背、叶脉夹角或隐蔽部位更容易暴露真实线索。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.PROGRESSION:
      return {
        questionText: `最近 7 天内，这类“${symptomLabel}”有没有明显变多、变大或加重？`,
        helpText: '进展速度会影响是活跃过程、环境事件，还是较稳定的旧损伤/旧斑。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION:
      if (patternKey === 'burn' || patternKey === 'tear') {
        return {
          questionText: '这些痕迹是否主要出现在更容易晒到太阳的一侧？',
          helpText: '这题只判断位置是否偏向受光面，用来区分日晒/环境伤和其他原因。',
          routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
        }
      }
      if (locationKey === 'stem' || patternKey === 'soft' || patternKey === 'soaked') {
        return {
          questionText: '最近盆土是否长期偏湿，或浇水后这类异常更容易加重？',
          helpText: '茎基部发软、水浸和塌陷，常需要结合湿度与浇水背景来分流。',
          routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
        }
      }
      return {
        questionText: `这种“${symptomLabel}”主要先出现在老叶，还是新叶也很明显？`,
        helpText: '受害叶龄和位置常帮助区分营养、环境与病虫害路径。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE:
      return {
        questionText:
          locationKey === 'leaf'
            ? '光照类问题先看摆放位置。最近 1-2 周，这盆植物更接近全日光、散光还是全阴？'
            : '光照类问题先看摆放位置。最近 1-2 周，这个部位是否更接近全日光或靠窗强直射？',
        helpText: '直接按全日光、散光、全阴或离窗远近选择；后端会结合这类植物的养护基线判断是否偏强。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT:
      return {
        questionText:
          locationKey === 'leaf'
            ? '浇水类问题先记录最近实际频率。最近 2 周，你的浇水更接近哪一种？'
            : '最近 2 周基质干湿变化更接近哪一种？',
        helpText: locationKey === 'leaf'
          ? '不需要先判断对错，只按实际频率和盆土干湿选择。'
          : '这一题用可选择的时间节奏记录干湿背景，后续会结合这类植物的日常需求判断是否偏离。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT:
      return {
        questionText: '施肥类问题要先记录次数和是否近期重肥/换盆。最近 1 个月，施肥情况更接近哪一种？',
        helpText: '这一题只记录供肥背景，不直接把黄化等同于缺肥。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    default:
      return {
        questionText: `关于“${symptomLabel}”，最近有没有变多、变大，或出现在其他位置？`,
        helpText: normalizeText(item?.userObservationTipCn) || '请尽量在自然光下，从整片叶、叶背和近景几个角度补充观察。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
  }
}

module.exports = { buildOrthogonalProbeText }
