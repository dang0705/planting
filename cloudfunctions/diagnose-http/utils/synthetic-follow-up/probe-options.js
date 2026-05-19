'use strict'

const { QUESTION_TARGET_DIMENSIONS } = require('../question-target-dimension')
const { normalizeText } = require('./keys')
const { CARE_CONTEXT_OPTION_COPY } = require('./templates')

function buildSyntheticObservedProbeOptionTexts(item = {}, targetDimension = '', _context = {}) {
  const locationKey = normalizeText(item?.locationKey)
  const patternKey = normalizeText(item?.patternKey)

  switch (targetDimension) {
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE:
      return {
        care_context: {
          text: '先排查日常养护变化',
          description: '先记录最近两周浇水、光照、施肥、通风湿度里变化最明显的一项，下一题会继续细分。'
        },
        pest_trace: {
          text: '看到虫子或虫害痕迹',
          description: '例如小虫、细网、黑点、叶面发黏、叶背有活动点等。'
        },
        disease_trace: {
          text: '还有斑点、烂斑或霉粉',
          description: '例如褐斑、黑斑、水渍感、软烂、霉层、粉状物等。'
        },
        yellowing_only: {
          text: '只是发黄，没看到其他异常',
          description: '如果主要就是叶色变黄，暂时没看到虫子、病斑或明显养护变化，选这个。'
        },
        unknown: {
          text: '不确定，继续帮我排查',
          description: '如果看不出最明显的方向，选这个，系统会继续从黄叶分布、养护背景和变化速度排查。'
        }
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE:
      return {
        halo_spots: '有褐色或黑色斑点，周围还有一圈发黄',
        water_soaked_soft: '斑点像被水浸过，发暗、半透明或偏软',
        powder_mold_surface: '表面像有粉、霉、灰尘或脏层',
        yellowing_only_no_lesion: '只是颜色发黄，没有明显斑点或烂斑',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN:
      return {
        new_leaves_first: '新叶更明显',
        old_lower_leaves_first: '老叶或下部叶更明显',
        no_clear_age_bias: '新老叶差不多，或看不出先后',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN:
      return {
        uniform_whole_leaf: '整片叶比较均匀地发黄',
        interveinal: '叶脉附近还绿，叶脉之间更黄',
        patchy_or_speckled: '一块块、斑驳，或很多小黄点',
        edge_or_scorch_patch: '主要是叶边或局部一块发黄发浅，像晒后留下的伤斑',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT:
      return {
        ...CARE_CONTEXT_OPTION_COPY.wateringFrequency
      }
    case QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT:
      return {
        ...CARE_CONTEXT_OPTION_COPY.lightContext
      }
    case QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT:
      return {
        ...CARE_CONTEXT_OPTION_COPY.fertilizationGrowth
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED:
      return {
        rapid_spreading: '几天到一两周内明显变多/变重',
        slow_stable: '变化较慢，基本稳定',
        with_wilting_or_drop: '同时明显萎蔫、掉叶或软塌',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE:
      return {
        pest_trace: '有小虫、黑色颗粒、黏液痕或新鲜不规则缺口',
        lesion_dropout: '先有褐斑、黑斑或黄边，后来中间干枯脱落',
        mechanical_old: '更像折伤、摩擦、旧伤或焦边裂开',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE:
      return {
        mite_webbing: '叶背或叶柄附近有细网、蜕皮，或极小活动点',
        thrips_silver_black: '有银白擦伤样痕迹，并伴很小的黑色排泄点',
        sticky_honeydew: '表面发黏，或附近有蜜露/煤灰样黑层',
        no_pest_trace: '没有这些虫害痕迹，更像晒伤、肥害、旧伤或普通变色',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE:
      return {
        watery_blister: '像透明或半透明小水泡，常在叶背更明显',
        corky_scab: '已经变褐、粗糙、结痂或像小疙瘩',
        flat_spot: '更像平的斑点或表面痕迹，不像鼓包',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN:
      return {
        mine_line: '更像叶片内部弯曲延伸的浅白隧道',
        other_mark: '更像表面划痕、旧伤或反光',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN:
      return {
        spreading_powder: '最近在叶面逐渐扩散或变多',
        limited_static: '只在少数固定位置，没有明显扩散',
        unknown: '说不清/没留意'
      }
    case QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE:
      return locationKey === 'leaf'
        ? {
            yes: '更像跟着叶片组织一起变化',
            no: '更像只停留在表面一层',
            unknown: '看不出/不确定'
          }
        : {
            yes: '更像附着在表面',
            no: '更像组织本身已经发黑/变色',
            unknown: '看不出/不确定'
          }
    case QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE:
      return locationKey === 'stem'
        ? {
            yes: '更像湿软发黏',
            no: '更像干瘪、塌陷或失去支撑',
            unknown: '看不出/不确定'
          }
        : {
            yes: '更像干硬坏死',
            no: '更像发软、带水渍感',
            unknown: '看不出/不确定'
          }
    case QUESTION_TARGET_DIMENSIONS.LESION_HALO:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE:
      return locationKey === 'leaf'
        ? {
            yes: '主要集中在个别叶片/局部',
            no: '多片叶子都能看到',
            unknown: '看不出/不确定'
          }
        : {
            yes: '主要集中在局部',
            no: '已经扩到更大范围',
            unknown: '看不出/不确定'
          }
    case QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '还没看叶背/看不出'
      }
    case QUESTION_TARGET_DIMENSIONS.PROGRESSION:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '说不清/没留意'
      }
    case QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION:
      if (patternKey === 'burn' || patternKey === 'tear') {
        return {
          yes: '是的',
          no: '不是的',
          unknown: '说不清/没留意'
        }
      }
      if (locationKey === 'stem' || patternKey === 'soft' || patternKey === 'soaked') {
        return {
          yes: '是的',
          no: '不是的',
          unknown: '说不清/没留意'
        }
      }
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE:
      return {
        yes: '全日光，或每天直射很多',
        no: '散光、全阴，或离窗较远',
        unknown: '说不清/没留意'
      }
    case QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT:
      return {
        yes: CARE_CONTEXT_OPTION_COPY.wateringFrequency.often_wet,
        no: CARE_CONTEXT_OPTION_COPY.wateringFrequency.often_dry,
        unknown: CARE_CONTEXT_OPTION_COPY.wateringFrequency.unknown
      }
    case QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT:
      return {
        yes: CARE_CONTEXT_OPTION_COPY.fertilizationGrowth.low_or_no_fertilizer,
        no: CARE_CONTEXT_OPTION_COPY.fertilizationGrowth.normal_light_fertilizer,
        unknown: CARE_CONTEXT_OPTION_COPY.fertilizationGrowth.unknown
      }
    default:
      return {
        yes: '是，更符合前面描述的情况',
        no: '否，更符合另一种情况',
        unknown: '看不出/不确定'
      }
  }
}

module.exports = { buildSyntheticObservedProbeOptionTexts }
